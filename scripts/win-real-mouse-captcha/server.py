"""
Windows 本机真实鼠标过滑块简化服务。

供 Docker 主栈通过 captcha.remote_service_url 转发 punish 链接到本机，
用 SendInput / 可见浏览器过滑块，避免 Linux 无头「视觉过了但没有 x5sec」。

协议兼容 backend-web: POST /api/v1/captcha/slider-solve
"""
from __future__ import annotations

import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI
from loguru import logger
from pydantic import BaseModel

# 从同目录 .env 加载（计划任务/手工启动都生效）
_ENV_FILE = Path(__file__).resolve().parent / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        _k, _v = _k.strip(), _v.strip().strip('"').strip("'")
        if _k and _k not in os.environ:
            os.environ[_k] = _v

ROOT = Path(__file__).resolve().parents[2] / "xianyu-auto-reply"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SECRET = (os.environ.get("WIN_CAPTCHA_SECRET") or "").strip()
HOST = os.environ.get("WIN_CAPTCHA_HOST", "0.0.0.0")
PORT = int(os.environ.get("WIN_CAPTCHA_PORT", "18900"))
# 开发者商城：阿里滑块获取 x5sec（优先于本机真实鼠标）
MARKETPLACE_URL = (
    os.environ.get("XIANYUSITE_INVOKE_URL")
    or "https://api.xianyusite.shop/api/external/invoke"
).strip()
MARKETPLACE_KEY = (os.environ.get("XIANYUSITE_X5SEC_API_KEY") or "").strip()
MARKETPLACE_TYPE = (os.environ.get("XIANYUSITE_X5SEC_TYPE") or "x5sec_all").strip()
MARKETPLACE_FIRST = (os.environ.get("XIANYUSITE_X5SEC_FIRST") or "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="real-mouse")
_import_lock = threading.Lock()
_real_mouse_ready = False
_run_real_mouse = None
_REAL_MOUSE_AVAILABLE = False


def _ensure_engine():
    global _real_mouse_ready, _run_real_mouse, _REAL_MOUSE_AVAILABLE
    if _real_mouse_ready:
        return
    with _import_lock:
        if _real_mouse_ready:
            return
        from common.services.captcha.real_mouse_slider import (  # noqa: WPS433
            REAL_MOUSE_AVAILABLE,
            run_real_mouse_verification,
        )

        _run_real_mouse = run_real_mouse_verification
        _REAL_MOUSE_AVAILABLE = bool(REAL_MOUSE_AVAILABLE)
        _real_mouse_ready = True
        logger.info(f"真实鼠标引擎就绪: available={_REAL_MOUSE_AVAILABLE}")


app = FastAPI(title="Win Real-Mouse Captcha", version="0.1.0")


class SliderSolveRequest(BaseModel):
    secret_key: str = ""
    account_id: str = ""
    url: str = ""
    browser_timeout: int = 60
    cookies: str = ""
    device_id: str = ""


class TestBody(BaseModel):
    url: str = ""
    secret_key: str = ""


def _auth_ok(secret_key: str) -> bool:
    if not SECRET:
        logger.error("未配置 WIN_CAPTCHA_SECRET")
        return False
    return (secret_key or "").strip() == SECRET


@app.get("/health")
def health():
    try:
        _ensure_engine()
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "real_mouse": False,
            "marketplace": bool(MARKETPLACE_KEY),
            "error": str(exc),
        }
    return {
        "ok": True,
        "real_mouse": _REAL_MOUSE_AVAILABLE,
        "marketplace": bool(MARKETPLACE_KEY),
        "marketplace_type": MARKETPLACE_TYPE if MARKETPLACE_KEY else None,
        "marketplace_first": MARKETPLACE_FIRST if MARKETPLACE_KEY else False,
        "port": PORT,
    }


def _try_marketplace_x5sec(account_id: str, punish_url: str) -> dict | None:
    """调用开发者商城 x5sec 接口；成功返回项目协议响应，失败返回 None（交回退）。"""
    if not MARKETPLACE_KEY:
        return None
    import httpx

    payload = {"type": MARKETPLACE_TYPE, "data": {"url": punish_url}}
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": MARKETPLACE_KEY,
        "Accept": "application/json",
    }
    logger.info(
        f"【{account_id}】优先尝试开发者商城过滑块 type={MARKETPLACE_TYPE} url={MARKETPLACE_URL}"
    )
    try:
        with httpx.Client(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
            resp = client.post(MARKETPLACE_URL, headers=headers, json=payload)
            raw = resp.text
            try:
                body = resp.json()
            except Exception:
                body = {}
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"【{account_id}】商城过滑块网络失败，回退本机: {exc}")
        return None

    if not isinstance(body, dict):
        logger.warning(f"【{account_id}】商城过滑块响应异常 HTTP {resp.status}: {raw[:200]}")
        return None

    msg = str(body.get("message") or "")
    if not body.get("success"):
        # 接口未开通/秘钥不匹配：明确打日志，交给本机鼠标
        logger.warning(
            f"【{account_id}】商城过滑块未通过：{msg or raw[:200]}（将回退真实鼠标）"
        )
        return None

    data = body.get("data") or {}
    x5sec = ""
    cookies: dict = {}
    if isinstance(data, dict):
        x5sec = str(data.get("x5sec") or "").strip()
        # 兼容直接返回 cookies 字典的实现
        maybe_cookies = data.get("cookies")
        if isinstance(maybe_cookies, dict):
            cookies = {str(k): str(v) for k, v in maybe_cookies.items() if v}
        if x5sec:
            cookies["x5sec"] = x5sec

    if not cookies:
        logger.warning(f"【{account_id}】商城返回 success 但无 x5sec/cookies: {raw[:240]}")
        return None

    logger.info(f"【{account_id}】商城过滑块成功 keys={list(cookies)}")
    return {
        "success": True,
        "message": "过滑块成功(商城)",
        "data": {
            "engine": f"marketplace:{MARKETPLACE_TYPE}",
            "cookies": cookies,
            "url_expired": False,
        },
    }


@app.post("/api/v1/captcha/slider-solve")
def slider_solve(req: SliderSolveRequest):
    if not _auth_ok(req.secret_key):
        return {"success": False, "message": "无效的秘钥", "data": None}

    url = (req.url or "").strip()
    if not url:
        # 与官方探测语义一致：秘钥过了、链接为空 → 连通成功
        return {"success": False, "message": "punish 链接不能为空", "data": None}

    raw_id = (req.account_id or "external").strip()
    account_id = re.sub(r"[^A-Za-z0-9_-]", "", raw_id)[:64] or "external"

    if MARKETPLACE_FIRST and MARKETPLACE_KEY:
        market = _try_marketplace_x5sec(account_id, url)
        if market is not None:
            return market

    try:
        _ensure_engine()
    except Exception as exc:  # noqa: BLE001
        logger.exception("加载真实鼠标引擎失败")
        return {"success": False, "message": f"引擎加载失败: {exc}", "data": None}

    if not _REAL_MOUSE_AVAILABLE or _run_real_mouse is None:
        return {
            "success": False,
            "message": "真实鼠标引擎不可用（需 Windows 桌面 + pyautogui）",
            "data": None,
        }

    # 真实鼠标需要可见 Chrome + 轨迹回放，20 秒往往不够
    timeout = max(60, min(int(req.browser_timeout or 60), 120))

    logger.info(f"【{account_id}】Win真实鼠标开始过滑块 timeout={timeout}s")

    def _job():
        return _run_real_mouse(
            account_id,
            url,
            existing_cookies_str=(req.cookies or "").strip(),
            browser_timeout=timeout,
            url_provider=None,
            weight_class="remote",
        )

    try:
        ok, cookies = _executor.submit(_job).result(timeout=timeout + 90)
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"【{account_id}】真实鼠标执行异常")
        return {"success": False, "message": f"过滑块执行异常: {exc}", "data": None}

    if ok and isinstance(cookies, dict) and any(
        str(k).lower().startswith("x5") for k in cookies
    ):
        logger.info(f"【{account_id}】Win真实鼠标过滑块成功 keys={list(cookies)}")
        return {
            "success": True,
            "message": "过滑块成功",
            "data": {"engine": "real_mouse", "cookies": cookies, "url_expired": False},
        }

    logger.warning(f"【{account_id}】Win真实鼠标过滑块失败")
    return {"success": False, "message": "过滑块失败", "data": {"engine": "real_mouse"}}


@app.post("/api/v1/captcha/slider-solve/test")
def slider_solve_test(req: TestBody):
    """兼容后台「测试」按钮的探测语义。"""
    return slider_solve(
        SliderSolveRequest(secret_key=req.secret_key, account_id="connectivity-test", url="")
    )


if __name__ == "__main__":
    if not SECRET:
        raise SystemExit("请先设置环境变量 WIN_CAPTCHA_SECRET（与后台远程过滑块秘钥一致）")
    import uvicorn

    logger.info(f"启动 Win 真实鼠标过滑块服务 http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
