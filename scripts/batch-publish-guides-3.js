/**
 * 批量单独上架（第三批：魂系列 7 本）
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
const OUT_FILE = path.join(ROOT, "config", "batch-guides-result-3.json");

const ITEMS = [
  {
    key: "elden-ultimate",
    shortName: "艾尔登法环终极攻略本",
    format: "PDF",
    title: "艾尔登法环终极攻略本PDF｜拍下自动发网盘",
    hook: "交界地总迷路、BOSS卡关？",
    what: "我整理的《艾尔登法环终极攻略本》PDF电子版，方便随时翻。",
    cover: "guide-elden-ultimate-cover.png",
    url: "https://pan.baidu.com/s/1szj-6CH3qQ6PC-DM19BWQg?pwd=9e8r",
    pwd: "9e8r",
  },
  {
    key: "sekiro",
    shortName: "只狼",
    format: "PDF",
    title: "只狼攻略本PDF｜拍下自动发网盘",
    hook: "弹反练到手软、流程卡死？",
    what: "我整理的《只狼》攻略PDF电子版，方便检索查阅。",
    cover: "guide-sekiro-cover.png",
    url: "https://pan.baidu.com/s/1UWIVTeSujv8fvqRWsJPamw?pwd=h4u6",
    pwd: "h4u6",
  },
  {
    key: "elden-famitsu",
    shortName: "老头环Fami通攻略书",
    format: "ZIP",
    title: "老头环Fami通攻略书ZIP｜拍下自动发网盘",
    hook: "想找完整攻略书却不好下？",
    what: "我整理的《老头环Fami通攻略书》压缩包电子版，方便查阅。",
    cover: "guide-elden-famitsu-cover.png",
    url: "https://pan.baidu.com/s/1JxOWwScdlJXbrsGLy33cdg?pwd=548p",
    pwd: "548p",
  },
  {
    key: "bloodborne",
    shortName: "血源诅咒",
    format: "PDF",
    title: "血源诅咒攻略本PDF｜拍下自动发网盘",
    hook: "亚南街道绕晕、Boss打不过？",
    what: "我整理的《血源诅咒》攻略PDF电子版，方便随时翻。",
    cover: "guide-bloodborne-cover.png",
    url: "https://pan.baidu.com/s/11ktrq2-KTPqOIDHaasuKYA?pwd=c8qz",
    pwd: "c8qz",
  },
  {
    key: "bloodborne-oldhunters",
    shortName: "血源诅咒老猎人",
    format: "PDF",
    title: "血源诅咒老猎人DLC攻略PDF｜拍下自动发网盘",
    hook: "老猎人DLC资料散、不好查？",
    what: "我整理的《血源诅咒老猎人》攻略PDF电子版，方便检索。",
    cover: "guide-bloodborne-oldhunters-cover.png",
    url: "https://pan.baidu.com/s/1ol3F_wxpheBHJMpekHOg3Q?pwd=kmru",
    pwd: "kmru",
  },
  {
    key: "ds-trilogy",
    shortName: "黑暗之魂三部曲",
    format: "PDF",
    title: "黑暗之魂三部曲攻略合集PDF｜拍下自动发网盘",
    hook: "三部曲流程太散、查起来费劲？",
    what: "我整理的《黑暗之魂三部曲》攻略合集PDF，方便一本查。",
    cover: "guide-ds-trilogy-cover.png",
    url: "https://pan.baidu.com/s/1erjAFD84bBt5S4-jQ82mXg?pwd=mgcr",
    pwd: "mgcr",
  },
  {
    key: "ds-remastered",
    shortName: "黑暗之魂重置版",
    format: "PDF",
    title: "黑暗之魂重置版攻略PDF｜拍下自动发网盘",
    hook: "重置版想重温却懒得东翻西找？",
    what: "我整理的《黑暗之魂重置版》攻略PDF电子版，方便随时翻。",
    cover: "guide-ds-remastered-cover.png",
    url: "https://pan.baidu.com/s/1b2qTTnH5xa5utPiGwhQnHA?pwd=3q6a",
    pwd: "3q6a",
  },
];

function buildDescription(item) {
  const fmtLine =
    item.format === "ZIP"
      ? "电子压缩包（ZIP），不是实体书。"
      : "电子PDF，不是实体书。";
  return [
    item.hook,
    item.what,
    "",
    "【你能拿到什么】",
    fmtLine,
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
    `《${item.shortName}》（${item.format}）网盘：`,
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
      { keyword: "怎么发货", reply: `电子${item.format}，付款后聊天自动发网盘，不用等快递～`, item_id: itemId },
      { keyword: "在吗", reply: `在的！《${item.shortName}》是${item.format}电子版，付款后自动发网盘链接哦。`, item_id: itemId },
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
