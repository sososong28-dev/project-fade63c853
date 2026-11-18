"""
公共商品发布执行服务

功能：
1. 统一执行单品发布的业务编排
2. 在发布前处理地址解析和发布日志
3. 在发布成功后自动同步账号商品
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from loguru import logger
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from common.models.xy_account import XYAccount
from common.services.cookie_probe_service import (
    COOKIE_INVALID_CODE,
    is_cookie_invalid_message,
    probe_cookie_alive,
)
from common.services.item_service import ItemService
from common.services.publish_address_service import PublishAddressService
from common.services.publish_log_service import PublishLogService
from common.services.xianyu_publish_service import publish_single_item


async def _get_account(session: AsyncSession, account_id: str, user_id: int) -> Optional[XYAccount]:
    """获取用户可用的闲鱼账号。"""
    stmt = (
        select(XYAccount)
        .where(
            XYAccount.account_id == account_id,
            XYAccount.owner_id == user_id,
        )
        .order_by(desc(XYAccount.id))
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def _sync_account_items_after_publish(
    session: AsyncSession,
    account_id: str,
    account: XYAccount,
) -> Dict[str, Any]:
    """发布成功后自动同步账号商品。"""
    item_svc = ItemService(session)
    try:
        sync_result = await item_svc.fetch_all_items_from_account(account=account)
        sync_status = "success" if sync_result.get("success") else "failed"
        sync_total_count = int(sync_result.get("total_count") or 0)
        sync_saved_count = int(sync_result.get("saved_count") or 0)
        if sync_status == "success":
            sync_message = f"已自动获取 {sync_total_count} 个商品，入库 {sync_saved_count} 个商品"
            logger.info(
                f"账号 {account_id} 发布后自动获取商品完成：共 {sync_total_count} 件，保存 {sync_saved_count} 件"
            )
        else:
            sync_message = f"自动获取商品失败：{sync_result.get('message') or '未知错误'}"
            logger.warning(
                f"账号 {account_id} 发布后自动获取商品失败，不影响后续发布：{sync_result.get('message', '未知错误')}"
            )
        return {
            "sync_status": sync_status,
            "sync_message": sync_message,
            "sync_total_count": sync_total_count,
            "sync_saved_count": sync_saved_count,
        }
    except Exception as sync_exc:
        logger.warning(
            f"账号 {account_id} 发布后自动获取商品异常，不影响后续发布：{sync_exc}"
        )
        return {
            "sync_status": "failed",
            "sync_message": f"自动获取商品异常：{sync_exc}",
            "sync_total_count": 0,
            "sync_saved_count": 0,
        }


async def execute_single_publish(
    session: AsyncSession,
    user_id: int,
    account_id: str,
    item_data: dict,
    static_root: str | Path | None = None,
) -> Dict[str, Any]:
    """执行单品发布并返回统一结果。"""
    log_svc = PublishLogService(session)
    address_svc = PublishAddressService(session)

    account = await _get_account(session=session, account_id=account_id, user_id=user_id)
    cookies_str = account.cookie if account and account.cookie else ""
    if not cookies_str:
        log = await log_svc.create_log(
            user_id=user_id,
            account_id=account_id,
            title=item_data.get("title", ""),
            description=item_data.get("description", ""),
            price=str(item_data.get("price", "")),
            material_id=item_data.get("id"),
            status="failed",
            error_message="账号不存在或无权使用",
        )
        return {
            "success": False,
            "message": "账号不存在或无权使用",
            "error_code": COOKIE_INVALID_CODE,
            "log_id": log.id,
            "retryable": False,
        }

    # 发布前轻量探活：Cookie 已死则不启动 Playwright，避免无效重试烧时间
    probe = await probe_cookie_alive(
        account_id=account_id,
        cookies_str=cookies_str,
        owner_id=user_id,
        account_status=getattr(account, "status", None),
    )
    if probe.cookies_str:
        cookies_str = probe.cookies_str
    if not probe.ok:
        fail_msg = probe.message or "Cookie已失效，请重新扫码登录"
        log = await log_svc.create_log(
            user_id=user_id,
            account_id=account_id,
            title=item_data.get("title", ""),
            description=item_data.get("description", ""),
            price=str(item_data.get("price", "")),
            material_id=item_data.get("id"),
            status="failed",
            error_message=fail_msg,
        )
        logger.error(f"账号 {account_id} 发布前 Cookie 探活失败，跳过 Playwright: {fail_msg}")
        return {
            "success": False,
            "message": fail_msg,
            "error_code": probe.error_code or COOKIE_INVALID_CODE,
            "log_id": log.id,
            "retryable": False,
        }

    try:
        resolved_address = await address_svc.resolve_publish_address(account_id, item_data)
    except ValueError as exc:
        log = await log_svc.create_log(
            user_id=user_id,
            account_id=account_id,
            title=item_data.get("title", ""),
            description=item_data.get("description", ""),
            price=str(item_data.get("price", "")),
            material_id=item_data.get("id"),
            status="failed",
            error_message=str(exc),
        )
        return {"success": False, "message": str(exc), "log_id": log.id}

    publish_item_data = resolved_address.apply_to_item_data(item_data)
    log = await log_svc.create_log(
        user_id=user_id,
        account_id=account_id,
        title=item_data.get("title", ""),
        description=item_data.get("description", ""),
        price=str(item_data.get("price", "")),
        material_id=item_data.get("id"),
        status="publishing",
        **resolved_address.to_log_fields(),
    )

    result = None
    pub_error = None
    try:
        result = await publish_single_item(
            item_data=publish_item_data,
            cookie=cookies_str,
            static_root=static_root,
        )
    except Exception as exc:
        pub_error = exc
        logger.error(f"单品发布异常: {exc}")

    from common.db.session import async_session_maker

    try:
        async with async_session_maker() as fresh_session:
            fresh_log_svc = PublishLogService(fresh_session)
            if pub_error:
                err_text = str(pub_error)
                await fresh_log_svc.update_log(
                    log_id=log.id,
                    status="failed",
                    error_message=err_text,
                )
                return {
                    "success": False,
                    "message": f"发布异常: {err_text}",
                    "error_code": COOKIE_INVALID_CODE if is_cookie_invalid_message(err_text) else None,
                    "log_id": log.id,
                    "retryable": not is_cookie_invalid_message(err_text),
                }

            status = "success" if result.get("success") else "failed"
            fail_message = None if result.get("success") else result.get("message")
            await fresh_log_svc.update_log(
                log_id=log.id,
                status=status,
                item_url=result.get("item_url"),
                item_id=result.get("item_id"),
                error_message=fail_message,
            )
    except Exception as db_err:
        logger.error(f"更新发布日志失败: {db_err}")

    if pub_error:
        err_text = str(pub_error)
        return {
            "success": False,
            "message": f"发布异常: {err_text}",
            "error_code": COOKIE_INVALID_CODE if is_cookie_invalid_message(err_text) else None,
            "log_id": log.id,
            "retryable": not is_cookie_invalid_message(err_text),
        }

    publish_success = result.get("success", False)
    sync_info = {
        "sync_status": "skipped",
        "sync_message": "发布未成功，未触发自动获取商品",
        "sync_total_count": 0,
        "sync_saved_count": 0,
    }
    if publish_success and account is not None:
        sync_info = await _sync_account_items_after_publish(
            session=session,
            account_id=account_id,
            account=account,
        )

    message = result.get("message") or ("商品发布成功" if publish_success else "发布失败")
    if publish_success and sync_info.get("sync_message"):
        message = f"{message}，{sync_info['sync_message']}"

    fail_message = None if publish_success else (result.get("message") or message)
    cookie_dead = (not publish_success) and is_cookie_invalid_message(fail_message)

    # 发布成功后：若 payload 带 card_id，自动绑定新 item_id
    bind_info = {"bind_status": "skipped", "bind_message": ""}
    if publish_success and result.get("item_id"):
        bind_info = await _bind_card_after_publish(
            session=session,
            user_id=user_id,
            item_id=str(result.get("item_id")),
            item_data=item_data,
        )
        if bind_info.get("bind_message"):
            message = f"{message}，{bind_info['bind_message']}"

    return {
        "success": publish_success,
        "message": message,
        "item_url": result.get("item_url"),
        "item_id": result.get("item_id"),
        "log_id": log.id,
        "error_code": COOKIE_INVALID_CODE if cookie_dead else result.get("error_code"),
        "retryable": False if cookie_dead else (True if not publish_success else None),
        **sync_info,
        **bind_info,
    }


async def _bind_card_after_publish(
    session: AsyncSession,
    user_id: int,
    item_id: str,
    item_data: dict,
) -> Dict[str, Any]:
    """发布成功后按 payload 中的 card_id / card_ids 绑定卡券。"""
    raw_ids = item_data.get("card_ids") or item_data.get("card_id")
    if raw_ids is None:
        return {"bind_status": "skipped", "bind_message": ""}

    if isinstance(raw_ids, (list, tuple, set)):
        card_ids = [int(x) for x in raw_ids if str(x).strip()]
    else:
        card_ids = [int(raw_ids)] if str(raw_ids).strip() else []

    if not card_ids:
        return {"bind_status": "skipped", "bind_message": ""}

    try:
        from common.services.card_matcher import CardMatcher

        matcher = CardMatcher(session)
        bound = 0
        for card_id in card_ids:
            existing = await matcher.get_card_item_ids(card_id)
            merged = list(dict.fromkeys([*(existing or []), item_id]))
            await matcher.update_card_item_relations(
                card_id=card_id,
                user_id=user_id,
                item_ids=merged,
            )
            bound += 1
        await session.commit()
        msg = f"已绑定卡券 {bound} 张到商品 {item_id}"
        logger.info(msg)
        return {"bind_status": "success", "bind_message": msg}
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"发布后绑定卡券失败（不影响发布结果）: {exc}")
        return {"bind_status": "failed", "bind_message": f"卡券绑定失败: {exc}"}
