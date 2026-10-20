/**
 * 上架：快速成为解决问题的高手 · 学习资料（2元，网盘自动发货）
 * 文案：真实换行；痛点→卖点→发货→提示
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.XIANYU_API_BASE || "http://127.0.0.1:8089";
const ROOT = path.join(__dirname, "..");
const token = fs.readFileSync(path.join(__dirname, ".token"), "utf8").trim();
const auth = { Authorization: `Bearer ${token}` };
const jsonHeaders = { ...auth, "Content-Type": "application/json" };
const ACCOUNT = "413198903";

const COVER = path.join(ROOT, "config", "problem-solving-course-cover.png");
const DETAIL = path.join(ROOT, "config", "guide-delivery-detail.png");
const OUT_FILE = path.join(ROOT, "config", "publish-problem-solving-course-result.json");

const SHORT_NAME = "快速成为解决问题高手-学习资料";
const TITLE = "快速成为解决问题的高手｜学习资料拍下自动发网盘";
const PAN_URL = "https://pan.baidu.com/s/12qsoyM6OwCGkAGh9redahQ?pwd=iwd5";
const PAN_PWD = "iwd5";
const PRICE = 2;
const ORIGINAL_PRICE = 9.9;
const EXISTING_CARD_ID = Number(process.env.CARD_ID || 0);

const DESCRIPTION = [
  "遇到问题容易卡住、思路散、不知道从哪下手？",
  "我把《快速成为解决问题的高手》这套学习资料整理好了，方便你边学边练。",
  "",
  "【你能拿到什么】",
  "电子学习资料包（完结整理），不是实体书。",
  "按主题查阅，适合自用学习与笔记对照。",
  "",
  "【怎么发货】",
  "付款后几秒，聊天自动发百度网盘链接和提取码。",
  "收到后建议马上转存。",
  "没收到直接回：补发 或 网盘。",
  "",
  "【小提示】",
  "本人整理分享的学习向资料；内容版权归原作者/权利方。",
  "适合想练问题解决思路、提升做事效率的同学。",
].join("\n");

const DELIVERY_TEXT = [
  "您好，感谢支持！",
  "",
  `《${SHORT_NAME}》网盘：`,
  PAN_URL,
  `提取码：${PAN_PWD}`,
  "",
  "建议马上转存。没收到回「补发」就行～",
].join("\n");

async function api(method, urlPath, body, headers = jsonHeaders) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function uploadImages() {
  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(COVER)], { type: "image/png" }), path.basename(COVER));
  form.append("files", new Blob([fs.readFileSync(DETAIL)], { type: "image/png" }), path.basename(DETAIL));
  const res = await fetch(`${BASE}/api/v1/product-publish/upload/images`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const data = await res.json();
  if (!data.success) throw new Error(`upload failed: ${data.message || res.status}`);
  return data.data.paths;
}

async function main() {
  if (!fs.existsSync(COVER)) throw new Error(`缺少封面: ${COVER}`);
  if (!fs.existsSync(DETAIL)) throw new Error(`缺少详情图: ${DETAIL}`);

  console.log("TITLE:", TITLE);
  console.log("DESC preview:\n" + DESCRIPTION);
  console.log("---");
  console.log("real newlines:", DESCRIPTION.includes("\n"));
  if (JSON.stringify(DESCRIPTION).includes("\\\\n")) {
    throw new Error("description still contains double-escaped newlines");
  }

  let cardId = EXISTING_CARD_ID;
  if (cardId) {
    const upd = await api("PUT", `/api/v1/cards/${cardId}`, {
      name: `${SHORT_NAME}-网盘`,
      type: "text",
      enabled: true,
      delay_seconds: 2,
      text_content: DELIVERY_TEXT,
    });
    console.log("reuse card:", cardId, upd.text.slice(0, 200));
  } else {
    const cardRes = await api("POST", "/api/v1/cards", {
      name: `${SHORT_NAME}-网盘`,
      type: "text",
      description: SHORT_NAME,
      enabled: true,
      delay_seconds: 2,
      text_content: DELIVERY_TEXT,
    });
    console.log("card:", cardRes.text.slice(0, 300));
    cardId = cardRes.data?.id ?? cardRes.data?.data?.id;
    if (!cardId) throw new Error("create card failed");
  }

  const images = await uploadImages();
  console.log("images:", images);

  const payload = {
    account_id: ACCOUNT,
    title: TITLE,
    description: DESCRIPTION,
    price: PRICE,
    original_price: ORIGINAL_PRICE,
    category: "其他闲置",
    images,
    address: "广东省深圳市南山区",
    delivery_method: "express",
    postage: 0,
    condition: "全新",
  };
  if (JSON.stringify(payload).includes("\\\\n")) {
    throw new Error("payload still contains double-escaped newlines");
  }

  console.log("publishing...");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  const pubRes = await fetch(`${BASE}/api/v1/product-publish/publish/single`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  const pubText = await pubRes.text();
  console.log("publish:", pubText.slice(0, 800));
  const pub = JSON.parse(pubText);
  if (!pub.success || !pub.data?.item_id) throw new Error(pub.message || "publish failed");

  const itemId = pub.data.item_id;
  await api("PUT", `/api/v1/cards/${cardId}/items`, { item_ids: [itemId] });
  await api("POST", `/api/v1/keywords-with-item-id/${ACCOUNT}`, {
    keywords: [
      {
        keyword: "网盘",
        reply: "付款后会自动发百度网盘链接和提取码，稍等几秒～没收到回「补发」就行。",
        item_id: itemId,
      },
      {
        keyword: "补发",
        reply: "好的，稍等，系统会按订单补发网盘；还没有的话把订单号发我。",
        item_id: itemId,
      },
      {
        keyword: "怎么发货",
        reply: "电子学习资料，付款后聊天自动发网盘，不用等快递～",
        item_id: itemId,
      },
      {
        keyword: "在吗",
        reply: "在的！是学习资料电子版，付款后自动发网盘链接哦。",
        item_id: itemId,
      },
    ],
  });

  const logs = await api("GET", "/api/v1/product-publish/logs?page=1&page_size=1", undefined, auth);
  const latest = logs.data?.data?.list?.[0] || logs.data?.list?.[0];
  const desc = latest?.description || "";
  const check = {
    itemId: latest?.item_id,
    realNewline: desc.includes("\n"),
    literalBackslashN: desc.includes("\\n"),
  };
  console.log("log check:", check);

  const out = {
    finishedAt: new Date().toISOString(),
    title: TITLE,
    price: PRICE,
    cardId,
    itemId,
    item_url: pub.data.item_url,
    pan: { url: PAN_URL, pwd: PAN_PWD },
    logCheck: check,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log("DONE", JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
