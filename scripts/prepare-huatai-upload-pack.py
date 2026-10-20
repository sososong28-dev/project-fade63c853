# -*- coding: utf-8 -*-
"""从 D:\\游戏攻略 PDF 截实物页，整理闲鱼手动上传包。"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pymupdf

SRC = Path(r"D:\游戏攻略\02-单机攻略本")
OUT = Path(r"D:\咸鱼自动化\upload-packs\2026-08-15-huatai-guides")
DETAIL_IMG = Path(r"D:\咸鱼自动化\config\guide-delivery-detail.png")

PRICE = "1"
ORIGINAL_PRICE = "9.9"

# 合订：同一游戏的上下册 / 基础知识+彻底攻略
SKUS = [
    {
        "key": "mario4",
        "short": "超级玛利欧4",
        "files": ["华泰超级玛利欧4.pdf"],
        "hook": "地图机关总绕晕、隐藏关找不到？",
        "what": "我整理的华泰《超级玛利欧4》攻略本扫描PDF，方便随时翻。",
        "extra": "含关卡路线与要点查阅。",
    },
    {
        "key": "gods-thunder-sprite",
        "short": "诸神纪事雷神出击爆破精灵",
        "files": ["华泰诸神纪事-雷神出击-爆破精灵.pdf"],
        "hook": "三款老游戏攻略散落各处不好查？",
        "what": "我整理的华泰合订本扫描PDF，覆盖诸神纪事、雷神出击、爆破精灵。",
        "extra": "一本里三款，检索更省事。",
    },
    {
        "key": "zelda-goemon",
        "short": "萨尔达传说与五卫门",
        "files": ["华泰萨尔达传说-诸神的神祗三角大陆-五卫门.pdf"],
        "hook": "神殿迷宫转晕了、道具顺序记不住？",
        "what": "我整理的华泰《萨尔达传说·诸神的神祗三角大陆 / 五卫门》扫描PDF。",
        "extra": "迷宫与流程查阅向。",
    },
    {
        "key": "sangokushi2",
        "short": "超级三国志2",
        "files": ["华泰超级三国志2.pdf"],
        "hook": "内政打仗两头忙、武将数据对不上？",
        "what": "我整理的华泰《超级三国志2》攻略本扫描PDF，方便对照查阅。",
        "extra": "含武将与流程要点。",
    },
    {
        "key": "makaimura",
        "short": "超魔界村惩魔传说",
        "files": ["华泰超魔界村-惩魔传说.pdf"],
        "hook": "横版关卡卡关、隐藏点不好找？",
        "what": "我整理的华泰《超魔界村 / 惩魔传说》合订扫描PDF。",
        "extra": "两款合订，翻页即可对照。",
    },
    {
        "key": "ff4",
        "short": "太空战士IV",
        "files": ["华泰太空战士IV-基础知识篇.pdf", "华泰太空战士IV-彻底攻略.pdf"],
        "hook": "职业搭配和剧情分支看花眼？",
        "what": "我整理的华泰《太空战士IV》两册扫描PDF：基础知识篇 + 彻底攻略。",
        "extra": "两册一起发，基础说明和流程都能查。",
    },
    {
        "key": "nobunaga",
        "short": "信长的野望武将风云录",
        "files": ["华泰信长的野望-武将风云录-完全攻略本.pdf"],
        "hook": "势力开局选不准、武将特性记不住？",
        "what": "我整理的华泰《信长的野望·武将风云录》完全攻略本扫描PDF。",
        "extra": "战略向查阅资料。",
    },
    {
        "key": "soulblazer",
        "short": "创世降魔录翡翠传说",
        "files": ["华泰创世降魔录-翡翠传说.pdf"],
        "hook": "地图探索漏东西、流程对不上？",
        "what": "我整理的华泰《创世降魔录 / 翡翠传说》扫描PDF。",
        "extra": "两款合订，方便对照。",
    },
    {
        "key": "dbz",
        "short": "七龙珠Z",
        "files": ["华泰七龙珠Z.pdf"],
        "hook": "出招和过关路线记不住？",
        "what": "我整理的华泰《七龙珠Z》攻略本扫描PDF，方便随时翻。",
        "extra": "战斗与流程查阅向。",
    },
    {
        "key": "lufia",
        "short": "复活邪神",
        "files": ["华泰复活邪神-完全解析编.pdf", "华泰复活邪神-彻底攻略编.pdf"],
        "hook": "迷宫分支多、装备数据对不上？",
        "what": "我整理的华泰《复活邪神》扫描PDF（完全解析编；彻底攻略编源文件损坏待补）。",
        "extra": "目前可发完全解析编。彻底攻略编 PDF 打不开，网盘先不要放坏文件。",
    },
    {
        "key": "sf2",
        "short": "街头快打2",
        "files": ["华泰街头快打2.pdf"],
        "hook": "出招表对不上、连段记不住？",
        "what": "我整理的华泰《街头快打2》攻略本扫描PDF，方便对照出招。",
        "extra": "格斗向查阅资料。",
    },
    {
        "key": "goemon3",
        "short": "魁人魔境传3",
        "files": ["华泰魁人魔境传3.pdf"],
        "hook": "关卡隐藏点总漏、道具顺序乱？",
        "what": "我整理的华泰《魁人魔境传3》攻略本扫描PDF。",
        "extra": "关卡查阅向。",
    },
    {
        "key": "dq5",
        "short": "勇者魁恶龙V",
        "files": ["华泰勇者魁恶龙V-攻略指引篇.pdf", "华泰勇者魁恶龙V-完整攻略.pdf"],
        "hook": "招募养成和迷宫路线对不上？",
        "what": "我整理的华泰《勇者魁恶龙V》两册扫描PDF：攻略指引篇 + 完整攻略。",
        "extra": "指引和完整流程一起发。",
    },
    {
        "key": "teitoku",
        "short": "提督之决断",
        "files": ["华泰提督之决断.pdf"],
        "hook": "海战编制看不懂、战役流程卡关？",
        "what": "我整理的华泰《提督之决断》攻略本扫描PDF。",
        "extra": "战役与编制查阅向。",
    },
    {
        "key": "sangokushi3",
        "short": "三国志III",
        "files": ["华泰三国志III-超级指南手册.pdf"],
        "hook": "内政指令多、武将能力对不上？",
        "what": "我整理的华泰《三国志III》超级指南手册扫描PDF。",
        "extra": "指南手册向，方便检索。",
    },
    {
        "key": "othello",
        "short": "战棋骑士",
        "files": ["华泰战棋骑士.pdf"],
        "hook": "战棋关卡卡关、兵种克制记不住？",
        "what": "我整理的华泰《战棋骑士》攻略本扫描PDF。",
        "extra": "关卡查阅向。",
    },
    {
        "key": "ff5",
        "short": "太空战士V",
        "files": ["华泰太空战士V-完全攻略篇.pdf", "华泰太空战士V-彻底攻略篇.pdf"],
        "hook": "职业转职和水晶流程绕晕了？",
        "what": "我整理的华泰《太空战士V》两册扫描PDF：完全攻略篇 + 彻底攻略篇。",
        "extra": "两册一起发，转职和流程都能查。",
    },
    {
        "key": "daisenryaku",
        "short": "大战略瑰代兵器战役",
        "files": ["华泰大战略-瑰代兵器战役.pdf"],
        "hook": "兵器数据和战役开局对不上？",
        "what": "我整理的华泰《大战略·瑰代兵器战役》扫描PDF。",
        "extra": "战役查阅向。",
    },
    {
        "key": "smt",
        "short": "真女神转生",
        "files": ["华泰真女神转生.pdf"],
        "hook": "仲魔合体和迷宫路线看花眼？",
        "what": "我整理的华泰《真女神转生》攻略本扫描PDF。",
        "extra": "合体与流程查阅向。",
    },
    {
        "key": "star-ocean",
        "short": "魔星迷踪",
        "files": ["华泰魔星迷踪.pdf"],
        "hook": "地图探索漏任务、技能搭配乱？",
        "what": "我整理的华泰《魔星迷踪》攻略本扫描PDF。",
        "extra": "探索查阅向。",
    },
    {
        "key": "aretha",
        "short": "王庆外传沙之章",
        "files": ["华泰王庆外传-沙之章-必胜法秘笈.pdf"],
        "hook": "迷宫和必胜要点散落不好查？",
        "what": "我整理的华泰《王庆外传·沙之章》必胜法秘笈扫描PDF。",
        "extra": "秘笈查阅向。",
    },
    {
        "key": "shining-force",
        "short": "光明八勇士",
        "files": ["华泰光明八勇士.pdf"],
        "hook": "战棋关卡卡关、升级路线不清楚？",
        "what": "我整理的华泰《光明八勇士》攻略本扫描PDF。",
        "extra": "关卡查阅向。",
    },
    {
        "key": "future-hero",
        "short": "未来勇者",
        "files": ["华泰未来勇者.pdf"],
        "hook": "流程卡关、道具位置记不住？",
        "what": "我整理的华泰《未来勇者》攻略本扫描PDF。",
        "extra": "流程查阅向。",
    },
    {
        "key": "halfbaked",
        "short": "半熟英雄",
        "files": ["华泰半熟英雄.pdf"],
        "hook": "养成和关卡规则看不懂？",
        "what": "我整理的华泰《半熟英雄》攻略本扫描PDF。",
        "extra": "规则与关卡查阅向。",
    },
    {
        "key": "gundam",
        "short": "机动战士圆桌骑士钢弹骑士",
        "files": ["华泰机动战士-圆桌骑士-钢弹骑士故事大遗产.pdf"],
        "hook": "机体数据和关卡流程对不上？",
        "what": "我整理的华泰《机动战士 / 圆桌骑士 / 钢弹骑士故事大遗产》扫描PDF。",
        "extra": "多作合订，方便对照。",
    },
    {
        "key": "dbz-butouden",
        "short": "七龙珠Z超武魁传",
        "files": ["华泰七龙珠Z-超武魁传.pdf"],
        "hook": "出招表和过关要点记不住？",
        "what": "我整理的华泰《七龙珠Z·超武魁传》攻略本扫描PDF。",
        "extra": "格斗向查阅资料。",
    },
    {
        "key": "yokoyama-oda",
        "short": "横山光辉三国志织田信长",
        "files": ["华泰横山光辉三国志-织田信长霸王之军围.pdf"],
        "hook": "两款策略作数据散、开局选不准？",
        "what": "我整理的华泰《横山光辉三国志 / 织田信长霸王之军围》扫描PDF。",
        "extra": "两款合订，方便对照。",
    },
    {
        "key": "tactics-ogre",
        "short": "皇家骑士团",
        "files": ["华泰皇家骑士团-必胜攻略法.pdf"],
        "hook": "分支路线和兵种培养绕晕了？",
        "what": "我整理的华泰《皇家骑士团》必胜攻略法扫描PDF。",
        "extra": "战棋向查阅资料。",
    },
    {
        "key": "dw3",
        "short": "真三国无双3",
        "files": ["真三国无双3-完全中文攻略本-上.pdf", "真三国无双3-完全中文攻略本-下.pdf"],
        "hook": "武将解锁和关卡收集对不上？",
        "what": "我整理的《真·三国无双3完全中文攻略本》上下册扫描PDF。",
        "extra": "上下册一起发。",
    },
    {
        "key": "dw4",
        "short": "真三国无双4",
        "files": ["真三国无双4-完全中文攻略本-上.pdf", "真三国无双4-完全中文攻略本-下.pdf"],
        "hook": "无双关卡和武器成长查起来费劲？",
        "what": "我整理的《真·三国无双4完全中文攻略本》上下册扫描PDF。",
        "extra": "上下册一起发。",
    },
    {
        "key": "pal3-ask",
        "short": "仙剑奇侠传三问情篇",
        "files": ["仙剑奇侠传三-问情篇-完全攻略本.pdf"],
        "hook": "支线漏做、仙术配装对不上？",
        "what": "我整理的《仙剑奇侠传三·问情篇完全攻略本》扫描PDF。",
        "extra": "流程与资料查阅向。",
    },
]


def title_of(sku: dict) -> str:
    return f"{sku['short']}攻略PDF｜拍下自动发网盘"


def description_of(sku: dict) -> str:
    files_line = "、".join(Path(f).stem for f in sku["files"])
    return "\n".join(
        [
            sku["hook"],
            sku["what"],
            "",
            "【你能拿到什么】",
            "电子PDF，不是实体书。",
            sku["extra"],
            f"文件：{files_line}",
            "",
            "【怎么发货】",
            "付款后几秒，聊天自动发百度网盘链接和提取码。",
            "收到后建议马上转存。",
            "没收到直接回：补发 或 网盘。",
            "",
            "【小提示】",
            "本人整理分享，扫描版攻略本，版权归原出版社与游戏厂商。",
            "适合想查阅怀旧攻略的玩家。",
        ]
    )


def delivery_of(sku: dict) -> str:
    return "\n".join(
        [
            "您好，感谢支持！",
            "",
            f"《{sku['short']}》（PDF）网盘：",
            "【粘贴网盘链接】",
            "提取码：【粘贴提取码】",
            "",
            "建议马上转存。没收到回「补发」就行～",
        ]
    )


def is_mostly_blank(page) -> bool:
    pix = page.get_pixmap(matrix=pymupdf.Matrix(0.2, 0.2), alpha=False)
    samples = pix.samples
    if not samples:
        return True
    mean = sum(samples) / len(samples)
    return mean > 245


def pick_cover_index(doc) -> int:
    for i in range(min(3, doc.page_count)):
        try:
            if not is_mostly_blank(doc[i]):
                return i
        except Exception:
            continue
    return 0


def pick_interior_indices(doc, cover_idx: int, want: int = 2) -> list[int]:
    n = doc.page_count
    if n <= 1:
        return []
    candidates = []
    for ratio in (0.12, 0.28, 0.45, 0.62):
        idx = min(n - 1, max(cover_idx + 1, int(n * ratio)))
        if idx not in candidates and idx != cover_idx:
            candidates.append(idx)
        if len(candidates) >= want:
            break
    return candidates[:want]


def render_page(page, dest: Path, max_side: int = 1400) -> None:
    rect = page.rect
    scale = min(max_side / max(rect.width, rect.height), 2.2)
    scale = max(scale, 1.0)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    dest.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(dest), jpg_quality=85)


def open_readable(pdfs: list[str]):
    last_err = None
    for name in pdfs:
        path = SRC / name
        try:
            doc = pymupdf.open(path)
        except Exception as e:
            last_err = e
            continue
        if doc.page_count > 0:
            return doc, name
        doc.close()
    raise RuntimeError(f"没有可渲染页: {pdfs} ({last_err})")


def extract_sku_images(sku: dict, folder: Path) -> list[str]:
    saved = []
    doc, used = open_readable(sku["files"])
    try:
        cover_idx = pick_cover_index(doc)
        render_page(doc[cover_idx], folder / "01-封面.jpg")
        saved.append("01-封面.jpg")
        interiors = pick_interior_indices(doc, cover_idx, 2 if len(sku["files"]) == 1 else 1)
        names = ["02-内页.jpg", "03-内页2.jpg"]
        for name, idx in zip(names, interiors):
            render_page(doc[idx], folder / name)
            saved.append(name)
    finally:
        doc.close()

    rest = [f for f in sku["files"] if f != used]
    if rest:
        try:
            doc2, _ = open_readable(rest)
        except RuntimeError:
            doc2 = None
        if doc2 is not None:
            try:
                idx2 = pick_cover_index(doc2)
                render_page(doc2[idx2], folder / "03-内页2.jpg")
                if "03-内页2.jpg" not in saved:
                    saved.append("03-内页2.jpg")
            finally:
                doc2.close()

    if DETAIL_IMG.exists():
        dest = folder / "04-发货说明.png"
        shutil.copy2(DETAIL_IMG, dest)
        saved.append("04-发货说明.png")
    return saved


def write_text(path: Path, text: str) -> None:
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8")


def main() -> None:
    missing = []
    for sku in SKUS:
        for f in sku["files"]:
            if not (SRC / f).exists():
                missing.append(f)
    if missing:
        raise SystemExit("缺少PDF:\n" + "\n".join(missing))

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    manifest = []
    for i, sku in enumerate(SKUS, 1):
        folder = OUT / f"{i:02d}-{sku['short']}"
        folder.mkdir(parents=True, exist_ok=True)
        print(f"[{i}/{len(SKUS)}] {sku['short']}")
        images = extract_sku_images(sku, folder)
        title = title_of(sku)
        desc = description_of(sku)
        delivery = delivery_of(sku)
        write_text(folder / "标题.txt", title)
        write_text(folder / "描述.txt", desc)
        write_text(folder / "卡券发货.txt", delivery)
        meta = {
            "key": sku["key"],
            "short": sku["short"],
            "title": title,
            "price": PRICE,
            "original_price": ORIGINAL_PRICE,
            "files": sku["files"],
            "images": images,
            "source_dir": str(SRC),
        }
        write_text(folder / "meta.json", json.dumps(meta, ensure_ascii=False, indent=2))
        manifest.append(meta)

    write_text(OUT / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    lines = [
        "# 2026-08-15 华泰/无双/仙剑 手动上传包",
        "",
        "图片均为 PDF 实物页截图（封面+内页），不是 AI 生成图。",
        "价格建议：现价 1 元，原价 9.9（与现有攻略一致，可按本改）。",
        "",
        "## 今天怎么用",
        "",
        "1. 先把对应 PDF 传到百度网盘，记下链接和提取码。",
        "2. 打开各商品文件夹，把 `卡券发货.txt` 里的【粘贴网盘链接】/【粘贴提取码】换成真实值。",
        "3. 闲鱼手动上架：标题、描述从 txt 复制；图片按 01→04 顺序上传。",
        "4. 上架成功后把 item_id 记下来，后台建卡券并绑定。",
        "",
        "## 商品清单",
        "",
        "| 序号 | 商品 | 文件数 | 文件夹 |",
        "|---|---|---:|---|",
    ]
    for i, sku in enumerate(SKUS, 1):
        folder = f"{i:02d}-{sku['short']}"
        lines.append(f"| {i} | {sku['short']} | {len(sku['files'])} | `{folder}` |")
    lines += [
        "",
        "## 文案结构（每条已写好）",
        "",
        "痛点 → 我整理了什么 → 你能拿到什么 → 怎么发货 → 小提示（版权归原厂）。",
        "",
        f"共 {len(SKUS)} 条（37 个 PDF，上下册/姊妹篇已合订）。",
    ]
    write_text(OUT / "00-上架清单.md", "\n".join(lines) + "\n")
    print("DONE", OUT)


if __name__ == "__main__":
    main()
