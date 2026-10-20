/**
 * 批量单独上架（第二批 8 本）
 * 文案：真实换行；痛点→卖点→发货→提示
 */
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:8089";
const ROOT = path.join(__dirname, "..");
const token = fs.readFileSync(path.join(__dirname, ".token"), "utf8").trim();
const auth = { Authorization: `Bearer ${token}` };
const jsonHeaders = { ...auth, "Content-Type": "application/json" };
const ACCOUNT = "413198903";
const DETAIL_IMG = path.join(ROOT, "config", "guide-delivery-detail.png");
const OUT_FILE = path.join(ROOT, "config", "batch-guides-result-2.json");

const ITEMS = [
  {
    key: "mhx",
    shortName: "怪物猎人X完全攻略本",
    title: "怪物猎人X完全攻略本PDF｜拍下自动发网盘",
    hook: "打怪总翻车、流程卡关？",
    what: "我整理的《怪物猎人X完全攻略本》PDF电子版，方便随时翻。",
    cover: "guide-mhx-cover.png",
    url: "https://pan.baidu.com/s/1o7MvZLWMJD1sMzLKClj3vQ?pwd=94ke",
    pwd: "94ke",
  },
  {
    key: "mh3rd",
    shortName: "怪物猎人携带版3rd完全攻略本",
    title: "怪物猎人携带版3rd攻略PDF｜拍下自动发网盘",
    hook: "掌机流程散、配装不好查？",
    what: "我整理的《怪物猎人携带版3rd完全攻略本》PDF电子版，方便检索。",
    cover: "guide-mh3rd-portable-cover.png",
    url: "https://pan.baidu.com/s/1V1p6ChgzZMkZuhZcMVbUOQ?pwd=6mxb",
    pwd: "6mxb",
  },
  {
    key: "mhdict",
    shortName: "怪物猎人珍藏事典",
    title: "怪物猎人珍藏事典PDF｜拍下自动发网盘",
    hook: "想查设定和资料却翻不到？",
    what: "我整理的《怪物猎人珍藏事典》PDF电子版，适合收藏查阅。",
    cover: "guide-mh-dictionary-cover.png",
    url: "https://pan.baidu.com/s/1CCEz-yGduNwPIdXvYbWOPg?pwd=ax8y",
    pwd: "ax8y",
  },
  {
    key: "mhencyc-new",
    shortName: "怪物猎人百科全书（新）",
    title: "怪物猎人百科全书新版PDF｜拍下自动发网盘",
    hook: "百科资料太散、不好检索？",
    what: "我整理的《怪物猎人百科全书（新）》PDF电子版，方便随时翻。",
    cover: "guide-mh-encyc-new-cover.png",
    url: "https://pan.baidu.com/s/1tN4l5aRrs-6d_VKQ3sBu2Q?pwd=5dsj",
    pwd: "5dsj",
  },
  {
    key: "mhencyc-old",
    shortName: "怪物猎人百科全书（旧）",
    title: "怪物猎人百科全书旧版PDF｜拍下自动发网盘",
    hook: "想对照旧版百科内容？",
    what: "我整理的《怪物猎人百科全书（旧）》PDF电子版，方便检索查阅。",
    cover: "guide-mh-encyc-old-cover.png",
    url: "https://pan.baidu.com/s/1J1tY0AtY_ZflJlgS7i6nYQ?pwd=p7uj",
    pwd: "p7uj",
  },
  {
    key: "pm20",
    shortName: "口袋妖怪20周年纪念特辑",
    title: "口袋妖怪20周年纪念特辑PDF｜拍下自动发网盘",
    hook: "想看纪念特辑却不好找电子版？",
    what: "我整理的《口袋妖怪20周年纪念特辑》PDF电子版，方便收藏阅读。",
    cover: "guide-pm20-cover.png",
    url: "https://pan.baidu.com/s/1RJoFQ60eWkOYhUVkHAk_Aw?pwd=282n",
    pwd: "282n",
  },
  {
    key: "pm10",
    shortName: "口袋妖怪十年特辑",
    title: "口袋妖怪十年特辑PDF｜拍下自动发网盘",
    hook: "十年特辑想留一份电子档？",
    what: "我整理的《口袋妖怪十年特辑》PDF电子版，方便随时翻。",
    cover: "guide-pm10-cover.png",
    url: "https://pan.baidu.com/s/1fRuRorn4OojctO_7dmuxyA?pwd=wt7t",
    pwd: "wt7t",
  },
  {
    key: "mh4g",
    shortName: "怪物猎人4G完全攻略本",
    title: "怪物猎人4G完全攻略本PDF｜拍下自动发网盘",
    hook: "狩猎压力大、攻略散落各处？",
    what: "我整理的《怪物猎人4G完全攻略本》PDF电子版，方便检索查阅。",
    cover: "guide-mh4g-cover.png",
    url: "https://pan.baidu.com/s/1MaOe1gDOQl6F5tPqXyD41w?pwd=bz4d",
    pwd: "bz4d",
  },
];

function buildDescription(item) {
  return [
    item.hook,
    item.what,
    "",
    "【你能拿到什么】",
    "电子PDF，不是实体书。",
    "整理向资料，方便检索查阅。",
    "",
    "【怎么发货】",
    "付款后几秒，聊天自动发百度网盘链接和提取码。",
    "收到后建议马上转存。",
    "没收到直接回：补发 或 网盘。",
    "",
    "【小提示】",
    "本人整理分享，游戏版权归原厂商。",
    "适合想快速查阅资料的玩家。",
  ].join("\n");
}

function buildDeliveryText(item) {
  return [
    "您好，感谢支持！",
    "",
    `《${item.shortName}》（PDF）网盘：`,
    item.url,
    `提取码：${item.pwd}`,
    "",
    "建议马上转存。没收到回「补发」就行～",
  ].join("\n");
}

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

async function uploadImages(coverPath) {
  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(coverPath)], { type: "image/png" }), path.basename(coverPath));
  form.append("files", new Blob([fs.readFileSync(DETAIL_IMG)], { type: "image/png" }), "guide-delivery-detail.png");
  const res = await fetch(`${BASE}/api/v1/product-publish/upload/images`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const data = await res.json();
  if (!data.success) throw new Error(`upload failed: ${data.message || res.status}`);
  return data.data.paths;
}

async function publishOne(item, existingCardId) {
  const coverPath = path.join(ROOT, "config", item.cover);
  if (!fs.existsSync(coverPath)) throw new Error(`缺少封面: ${coverPath}`);
  if (!fs.existsSync(DETAIL_IMG)) throw new Error(`缺少详情图: ${DETAIL_IMG}`);

  const description = buildDescription(item);
  console.log(`\n===== ${item.key} =====`);
  console.log(item.title);

  let cardId = existingCardId;
  if (!cardId) {
    const cardRes = await api("POST", "/api/v1/cards", {
      name: `${item.shortName}-网盘`,
      type: "text",
      description: item.shortName,
      enabled: true,
      delay_seconds: 2,
      text_content: buildDeliveryText(item),
    });
    console.log("card:", cardRes.text.slice(0, 200));
    cardId = cardRes.data?.id;
    if (!cardId) throw new Error("create card failed");
  } else {
    await api("PUT", `/api/v1/cards/${cardId}`, {
      name: `${item.shortName}-网盘`,
      type: "text",
      enabled: true,
      delay_seconds: 2,
      text_content: buildDeliveryText(item),
    });
    console.log("reuse card:", cardId);
  }

  // 暴露 cardId，失败重试时可复用
  publishOne.lastCardId = cardId;

  const images = await uploadImages(coverPath);
  const payload = {
    account_id: ACCOUNT,
    title: item.title,
    description,
    price: 1,
    original_price: 9.9,
    category: "其他闲置",
    images,
    address: "广东省深圳市南山区",
    delivery_method: "express",
    postage: 0,
    condition: "全新",
  };
  if (JSON.stringify(payload).includes("\\\\n")) throw new Error("double-escaped newlines");

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
  console.log("publish:", pubText.slice(0, 450));
  const pub = JSON.parse(pubText);
  if (!pub.success || !pub.data?.item_id) throw new Error(pub.message || "publish failed");

  const itemId = pub.data.item_id;
  await api("PUT", `/api/v1/cards/${cardId}/items`, { item_ids: [itemId] });
  await api("POST", `/api/v1/keywords-with-item-id/${ACCOUNT}`, {
    keywords: [
      { keyword: "网盘", reply: "付款后会自动发百度网盘链接和提取码，稍等几秒～没收到回「补发」就行。", item_id: itemId },
      { keyword: "补发", reply: "好的，稍等，系统会按订单补发网盘；还没有的话把订单号发我。", item_id: itemId },
      { keyword: "怎么发货", reply: "电子PDF，付款后聊天自动发网盘，不用等快递～", item_id: itemId },
      { keyword: "在吗", reply: `在的！《${item.shortName}》是PDF电子版，付款后自动发网盘链接哦。`, item_id: itemId },
    ],
  });

  const logs = await api("GET", "/api/v1/product-publish/logs?page=1&page_size=1", undefined, auth);
  const desc = logs.data?.data?.list?.[0]?.description || "";
  console.log("newline real:", desc.includes("\n"));

  return {
    key: item.key,
    title: item.title,
    cardId,
    itemId,
    item_url: pub.data.item_url,
    pwd: item.pwd,
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const results = [];
  const errors = [];
  const cardMap = {};

  for (const item of ITEMS) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`retry ${item.key} attempt ${attempt}`);
          await sleep(12000);
        }
        const row = await publishOne(item, cardMap[item.key]);
        cardMap[item.key] = row.cardId;
        results.push(row);
        lastErr = null;
        await sleep(8000);
        break;
      } catch (e) {
        lastErr = String(e.message || e);
        console.error(`FAIL ${item.key} #${attempt}:`, lastErr);
        if (publishOne.lastCardId) cardMap[item.key] = publishOne.lastCardId;
      }
    }
    if (lastErr) errors.push({ key: item.key, error: lastErr });
  }

  const out = { finishedAt: new Date().toISOString(), results, errors };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log("\n==== SUMMARY ====");
  console.log(JSON.stringify(out, null, 2));
  if (errors.length) process.exit(1);
}

main();
