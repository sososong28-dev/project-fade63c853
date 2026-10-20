import asyncio
import re
import aiohttp
from sqlalchemy import text
from common.db.session import async_session_maker


async def main():
    async with async_session_maker() as s:
        row = (
            await s.execute(
                text(
                    "SELECT cookie FROM xy_accounts WHERE account_id='413198903' ORDER BY id DESC LIMIT 1"
                )
            )
        ).first()
    cookie = row[0] if row else ""
    print("db_cookie_len", len(cookie or ""))
    headers = {
        "Cookie": cookie,
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.goofish.com/",
    }
    async with aiohttp.ClientSession() as sess:
        async with sess.get(
            "https://www.goofish.com/publish",
            headers=headers,
            allow_redirects=True,
            timeout=aiohttp.ClientTimeout(total=40),
        ) as resp:
            html = await resp.text()
            print("status", resp.status, "final_url", str(resp.url)[:160])
            print("url_has_login", "login" in str(resp.url).lower())
            print("body_has_添加首图", "添加首图" in html)
            print("body_has_宝贝图片", "宝贝图片" in html)
            print("body_has_立即登录", "立即登录" in html)
            print("body_has_登录后可以", "登录后可以" in html)
            text_snip = re.sub(r"\s+", " ", html)[:300]
            print("snip", text_snip)


if __name__ == "__main__":
    asyncio.run(main())
