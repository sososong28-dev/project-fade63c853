"""
发布前 Cookie 轻量探活

用 mtop 商品列表接口验证会话是否仍有效，避免 Playwright 白跑后才报未登录。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from loguru import logger

from common.services.xianyu_mtop import mtop_call

COOKIE_INVALID_CODE = "COOKIE_INVALID"
ITEM_LIST_API = "mtop.idle.web.xyh.item.list"
ITEM_LIST_VERSION = "1.0"


@dataclass
class CookieProbeResult:
    """Cookie 探活结果。"""

    ok: bool
    error_code: Optional[str] = None
    message: str = ""
    cookies_str: str = ""

    @property
    def is_cookie_invalid(self) -> bool:
        return self.error_code == COOKIE_INVALID_CODE


def is_cookie_invalid_message(message: str | None) -> bool:
    """判断错误文案是否为 Cookie/未登录类硬失败（应停止重试）。"""
    text = str(message or "")
    markers = (
        COOKIE_INVALID_CODE,
        "Cookie已失效",
        "Cookie 已失效",
        "未登录",
        "页面跳转到登录页",
        "账号不存在或无权使用",
        "FAIL_SYS_SESSION_EXPIRED",
        "Session过期",
    )
    return any(marker in text for marker in markers)


async def probe_cookie_alive(
    account_id: str,
    cookies_str: str,
    *,
    owner_id: Optional[int] = None,
    account_status: Optional[str] = None,
) -> CookieProbeResult:
    """轻量探活：调一次在售商品列表。

    - success: Cookie 可用（可能顺带刷新了 _m_h5_tk）
    - account_invalid / Session 过期: 明确 COOKIE_INVALID
    - 其它网络错误: 不阻断发布（交给 Playwright 再判），避免误杀
    """
    status = (account_status or "").strip().lower()
    if status in {"disabled", "inactive", "offline"}:
        return CookieProbeResult(
            ok=False,
            error_code=COOKIE_INVALID_CODE,
            message=f"[{COOKIE_INVALID_CODE}] 账号状态为 {status}，请先扫码续登并启用账号",
            cookies_str=(cookies_str or "").strip(),
        )

    cookie = (cookies_str or "").strip()
    if not cookie:
        return CookieProbeResult(
            ok=False,
            error_code=COOKIE_INVALID_CODE,
            message="账号 Cookie 为空，请重新扫码登录",
            cookies_str="",
        )

    # 缺少 unb 基本无法维持登录态
    cookie_keys = {
        part.split("=", 1)[0].strip()
        for part in cookie.split(";")
        if "=" in part
    }
    if "unb" not in cookie_keys:
        logger.warning(f"【{account_id}】Cookie 缺少 unb 字段")
        return CookieProbeResult(
            ok=False,
            error_code=COOKIE_INVALID_CODE,
            message="Cookie缺少必需的unb字段，请重新扫码登录",
            cookies_str=cookie,
        )

    data = {
        "needGroupInfo": False,
        "pageNumber": 1,
        "pageSize": 1,
        "groupName": "在售",
        "groupId": "58877261",
        "defaultGroup": True,
        "userId": str(account_id),
    }

    try:
        result = await mtop_call(
            account_id=account_id,
            cookies_str=cookie,
            api=ITEM_LIST_API,
            version=ITEM_LIST_VERSION,
            data=data,
            owner_id=owner_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"【{account_id}】Cookie 探活异常（不阻断，交由发布页复核）: {exc}")
        return CookieProbeResult(ok=True, message=f"探活异常已忽略: {exc}", cookies_str=cookie)

    refreshed = result.get("cookies_str") or cookie
    if result.get("success"):
        return CookieProbeResult(ok=True, message="Cookie 探活通过", cookies_str=refreshed)

    if result.get("account_invalid") or is_cookie_invalid_message(result.get("error")):
        msg = result.get("error") or "Cookie已失效，请重新扫码登录"
        logger.error(f"【{account_id}】Cookie 探活失败: {msg}")
        return CookieProbeResult(
            ok=False,
            error_code=COOKIE_INVALID_CODE,
            message=f"[{COOKIE_INVALID_CODE}] {msg}",
            cookies_str=refreshed,
        )

    # 对发布场景更严格：mtop 业务失败也视为会话不稳，禁止空跑 Playwright
    msg = result.get("error") or "Cookie探活未通过"
    logger.error(f"【{account_id}】Cookie 探活未通过，阻止发布: {msg}")
    return CookieProbeResult(
        ok=False,
        error_code=COOKIE_INVALID_CODE,
        message=f"[{COOKIE_INVALID_CODE}] {msg}",
        cookies_str=refreshed,
    )
