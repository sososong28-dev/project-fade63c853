"""
成交后自动重上架服务

在自动发货成功后，根据卡券/素材快照重新发布同款虚拟品，并绑定新 item_id。
Cookie 失效时写入队列，不无意义重试。
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.services.cookie_probe_service import (
    COOKIE_INVALID_CODE,
    is_cookie_invalid_message,
    probe_cookie_alive,
)
from common.services.publish_execution_service import execute_single_publish

# 运维侧可编辑的重上目录（容器外也可挂载）
DEFAULT_CATALOG_PATHS = [
    Path("/app/static/relist-catalog.json"),
    Path(__file__).resolve().parents[3] / "config" / "relist-catalog.json",
]


def _load_catalog() -> List[Dict[str, Any]]:
    for path in DEFAULT_CATALOG_PATHS:
        try:
            if path.is_file():
                data = json.loads(path.read_text(encoding="utf-8"))
                items = data.get("items") if isinstance(data, dict) else data
                if isinstance(items, list):
                    return items
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"读取重上目录失败 {path}: {exc}")
    return []


def find_relist_template(
    *,
    card_id: Optional[int] = None,
    item_id: Optional[str] = None,
    title_hint: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """按 card_id / 旧 item_id / 标题关键字匹配重上模板。"""
    catalog = _load_catalog()
    if not catalog:
        return None

    if card_id is not None:
        for row in catalog:
            if int(row.get("card_id") or 0) == int(card_id):
                return row

    if item_id:
        for row in catalog:
            old_ids = row.get("item_ids") or row.get("known_item_ids") or []
            if str(item_id) in {str(x) for x in old_ids}:
                return row

    if title_hint:
        hint = title_hint.strip()
        for row in catalog:
            keys = row.get("title_keywords") or []
            if any(str(k) and str(k) in hint for k in keys):
                return row
            if row.get("title") and row["title"] in hint:
                return row
    return None


async def enqueue_relist_after_delivery(
    session: AsyncSession,
    *,
    user_id: int,
    account_id: str,
    sold_item_id: str,
    card_id: Optional[int] = None,
    item_title: Optional[str] = None,
) -> Dict[str, Any]:
    """发货成功后尝试自动重上。

    Returns:
        {success, skipped, message, error_code?, item_id?}
    """
    template = find_relist_template(
        card_id=card_id,
        item_id=sold_item_id,
        title_hint=item_title,
    )
    if not template:
        msg = (
            f"未找到重上模板 sold_item_id={sold_item_id} card_id={card_id}；"
            "请在 config/relist-catalog.json 配置"
        )
        logger.warning(msg)
        return {"success": False, "skipped": True, "message": msg}

    # 账号 Cookie 探活
    from common.models.xy_account import XYAccount
    from sqlalchemy import desc

    stmt = (
        select(XYAccount)
        .where(XYAccount.account_id == account_id, XYAccount.owner_id == user_id)
        .order_by(desc(XYAccount.id))
        .limit(1)
    )
    account = (await session.execute(stmt)).scalars().first()
    cookie = account.cookie if account else ""
    probe = await probe_cookie_alive(account_id, cookie or "", owner_id=user_id)
    if not probe.ok:
        msg = probe.message or "Cookie已失效，重上已跳过，请扫码后手动重上"
        logger.error(f"【{account_id}】自动重上中止: {msg}")
        return {
            "success": False,
            "skipped": False,
            "retryable": False,
            "error_code": probe.error_code or COOKIE_INVALID_CODE,
            "message": msg,
        }

    item_data = {
        "title": template.get("title"),
        "description": template.get("description"),
        "price": template.get("price", 1),
        "original_price": template.get("original_price", 9.9),
        "category": template.get("category", "其他闲置"),
        "images": template.get("images") or [],
        "address": template.get("address") or "广东省深圳市南山区",
        "delivery_method": template.get("delivery_method", "express"),
        "postage": template.get("postage", 0),
        "condition": template.get("condition", "全新"),
        "card_id": template.get("card_id") or card_id,
    }
    if not item_data["title"] or not item_data["description"] or not item_data["images"]:
        return {
            "success": False,
            "skipped": True,
            "message": "重上模板缺少 title/description/images",
        }

    logger.info(
        f"【{account_id}】开始自动重上: sold={sold_item_id} template={template.get('key') or template.get('title')}"
    )
    result = await execute_single_publish(
        session=session,
        user_id=user_id,
        account_id=account_id,
        item_data=item_data,
    )
    ok = bool(result.get("success"))
    if ok:
        logger.info(
            f"【{account_id}】自动重上成功 new_item_id={result.get('item_id')} "
            f"bind={result.get('bind_status')}"
        )
    else:
        logger.error(
            f"【{account_id}】自动重上失败: {result.get('message')} code={result.get('error_code')}"
        )

    return {
        "success": ok,
        "skipped": False,
        "retryable": result.get("retryable"),
        "error_code": result.get("error_code"),
        "message": result.get("message"),
        "item_id": result.get("item_id"),
        "item_url": result.get("item_url"),
        "log_id": result.get("log_id"),
        "sold_item_id": sold_item_id,
        "finished_at": datetime.utcnow().isoformat() + "Z",
    }
