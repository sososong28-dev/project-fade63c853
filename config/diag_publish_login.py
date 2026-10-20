import asyncio
import re
from pathlib import Path

from sqlalchemy import text
from common.db.session import async_session_maker


async def main():
    async with async_session_maker() as s:
        row = (
            await s.execute(
                text(
                    """
                    SELECT account_id, status, disable_reason,
                           LENGTH(cookie) AS cookie_len,
                           updated_at, last_login_at, last_refresh_at
                    FROM xy_accounts
                    WHERE account_id='413198903'
                    ORDER BY id DESC LIMIT 1
                    """
                )
            )
        ).mappings().first()
        print("ACCOUNT", dict(row) if row else None)

        cookie_row = (
            await s.execute(
                text(
                    "SELECT cookie FROM xy_accounts WHERE account_id='413198903' ORDER BY id DESC LIMIT 1"
                )
            )
        ).first()
        cookie = cookie_row[0] if cookie_row else ""
        keys = []
        for part in (cookie or "").split(";"):
            part = part.strip()
            if "=" in part:
                keys.append(part.split("=", 1)[0].strip())
        keys = sorted(set(keys))
        print("COOKIE_LEN", len(cookie or ""))
        print("COOKIE_KEYS", ", ".join(keys))
        important = [
            "unb",
            "cookie2",
            "sgcookie",
            "_m_h5_tk",
            "_m_h5_tk_enc",
            "cna",
            "isg",
            "tfstk",
            "tracknick",
            "lid",
            "xlly_s",
            "havana_lgc2_0",
            "sdkSilent",
        ]
        print(
            "IMPORTANT",
            {k: (k in keys) for k in important},
        )

        logs = (
            await s.execute(
                text(
                    """
                    SELECT id, status, error_message, created_at
                    FROM xy_publish_logs
                    ORDER BY id DESC LIMIT 10
                    """
                )
            )
        ).mappings().all()
        print("RECENT_PUBLISH_LOGS")
        for l in logs:
            err = (l.get("error_message") or "")[:140]
            print(f"  #{l['id']} {l['created_at']} {l['status']} | {err}")

    # Playwright 同款判断：注入 cookie 后打开发布页，打印正文摘要
    from playwright.async_api import async_playwright
    from common.utils.browser_utils import ensure_playwright_browser_path, get_chromium_executable_path

    ensure_playwright_browser_path()
    pw = await async_playwright().start()
    launch_kwargs = {"headless": True}
    chromium_path = get_chromium_executable_path()
    if chromium_path:
        launch_kwargs["executable_path"] = chromium_path
    browser = await pw.chromium.launch(**launch_kwargs)
    context = await browser.new_context(
        viewport={"width": 1280, "height": 800},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        locale="zh-CN",
    )

    # A: 当前实现（强制 httpOnly/secure）
    cookie_list_a = []
    for item in cookie.split(";"):
        item = item.strip()
        if "=" not in item:
            continue
        name, value = item.split("=", 1)
        for domain in [".goofish.com", ".taobao.com", ".alipay.com"]:
            cookie_list_a.append(
                {
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": domain,
                    "path": "/",
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "Lax",
                }
            )
    await context.add_cookies(cookie_list_a)
    page = await context.new_page()
    await page.goto("https://www.goofish.com/publish", wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(5)
    url_a = page.url
    text_a = await page.evaluate("() => document.body?.innerText || ''")
    title_a = await page.title()
    print("MODE_A_FORCE_HTTPONLY")
    print("  url", url_a)
    print("  title", title_a)
    print("  has_form", ("添加首图" in text_a) or ("宝贝图片" in text_a))
    print("  has_login_hint", ("立即登录" in text_a) or ("登录后可以" in text_a) or (text_a.strip()[:20] == "登录"))
    print("  text_snip", re.sub(r"\s+", " ", text_a)[:200])
    shot_a = Path("/app/backend-web/logs/diag-publish-A.png")
    await page.screenshot(path=str(shot_a), full_page=True)
    print("  screenshot", shot_a)

    await context.close()

    # B: 不强制 httpOnly（更接近真实浏览器）
    context_b = await browser.new_context(
        viewport={"width": 1280, "height": 800},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        locale="zh-CN",
    )
    cookie_list_b = []
    for item in cookie.split(";"):
        item = item.strip()
        if "=" not in item:
            continue
        name, value = item.split("=", 1)
        for domain in [".goofish.com", ".taobao.com", ".alipay.com"]:
            cookie_list_b.append(
                {
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": domain,
                    "path": "/",
                    "secure": True,
                    "sameSite": "Lax",
                }
            )
    await context_b.add_cookies(cookie_list_b)
    page_b = await context_b.new_page()
    await page_b.goto("https://www.goofish.com/publish", wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(5)
    url_b = page_b.url
    text_b = await page_b.evaluate("() => document.body?.innerText || ''")
    title_b = await page_b.title()
    print("MODE_B_NO_HTTPONLY_FORCE")
    print("  url", url_b)
    print("  title", title_b)
    print("  has_form", ("添加首图" in text_b) or ("宝贝图片" in text_b))
    print("  has_login_hint", ("立即登录" in text_b) or ("登录后可以" in text_b) or (text_b.strip()[:20] == "登录"))
    print("  text_snip", re.sub(r"\s+", " ", text_b)[:200])
    shot_b = Path("/app/backend-web/logs/diag-publish-B.png")
    await page_b.screenshot(path=str(shot_b), full_page=True)
    print("  screenshot", shot_b)

    # document.cookie 可见性对比
    js_cookie_b = await page_b.evaluate("() => document.cookie")
    print("MODE_B_DOCUMENT_COOKIE_LEN", len(js_cookie_b or ""))
    print("MODE_B_DOCUMENT_COOKIE_KEYS", sorted({p.split("=")[0] for p in (js_cookie_b or "").split("; ") if "=" in p}))

    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
