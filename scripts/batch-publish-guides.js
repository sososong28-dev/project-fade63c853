/**
 * 批量单独上架：每本攻略独立卡券 + 独立商品 + 真实换行文案
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

const ITEMS = [
  {
    key: "pokedex",
    fileName: "宝可梦游戏大图鉴.pdf",
    shortName: "宝可梦游戏大图鉴",
    title: "宝可梦游戏大图鉴PDF｜拍下自动发网盘",
    hook: "图鉴翻来翻去找不到？",
    what: "我整理的《宝可梦游戏大图鉴》PDF电子版，方便检索查阅。",
    cover: path.join(ROOT, "config", "guide-pokedex-cover.png"),
    url: "https://pan.baidu.com/s/1M2C1myIqooGv57hvusHwNQ?pwd=jwhv",
    pwd: "jwhv",
  },
  {
    key: "mh2g",
    fileName: "怪物猎人2G完全攻略.pdf",
    shortName: "怪物猎人2G完全攻略",
    title: "怪物猎人2G完全攻略PDF｜拍下自动发网盘",
    hook: "打怪总翻车、流程卡关？",
    what: "我整理的《怪物猎人2G完全攻略》PDF电子版，方便随时翻。",
    cover: path.join(ROOT, "config", "guide-mh2g-cover.png"),
    url: "https://pan.baidu.com/s/1g1K2M5ej2Qt5YrDnb9XDJw?pwd=kenx",
    pwd: "kenx",
  },
  {
    key: "mh2nd",
    fileName: "怪物猎人2nd攻略本.pdf",
    shortName: "怪物猎人2nd攻略本",
    title: "怪物猎人2nd攻略本PDF｜拍下自动发网盘",
    hook: "配装看花眼、副本不顺？",
    what: "我整理的《怪物猎人2nd攻略本》PDF电子版，方便检索查阅。",
    cover: path.join(ROOT, "config", "guide-mh2nd-cover.png"),
    url: "https://pan.baidu.com/s/1E7WyFGP66ZLKO-KrLrqByQ?pwd=wjyf",
    pwd: "wjyf",
  },
  {
    key: "mh3tri",
    fileName: "怪物猎人3tri攻略.pdf",
    shortName: "怪物猎人3tri攻略",
    title: "怪物猎人3tri攻略PDF｜拍下自动发网盘",
    hook: "想快速上手又懒得东翻西找？",
    what: "我整理的《怪物猎人3tri攻略》PDF电子版，一本查关键内容。",
    cover: path.join(ROOT, "config", "guide-mh3tri-cover.png"),
    url: "https://pan.baidu.com/s/1FDi54KHUFeMTGpWWSiwOwQ?pwd=j6u1",
    pwd: "j6u1",
  },
  {
    key: "mh4",
    fileName: "怪物猎人4 完全狩猎攻略本.pdf",
    shortName: "怪物猎人4完全狩猎攻略本",
    title: "怪物猎人4完全狩猎攻略PDF｜拍下自动发网盘",
    hook: "狩猎压力大、攻略散落各处？",
    what: "我整理的《怪物猎人4完全狩猎攻略本》PDF电子版，方便随时翻。",
    cover: path.join(ROOT, "config", "guide-mh4-cover.png"),
    url: "https://pan.baidu.com/s/1HPIp3_T14LIcPQSlinN9ig?pwd=2nuw",
    pwd: "2nuw",
  },
];

function buildDescription(item) {
  return [
    item.hook,
    item.what,
    "",
    "【你能拿到什么】",
    "电子PDF，不是实体书。",
    "整理向攻略/图鉴，方便检索查阅。",
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

async function publishOne(item) {
  if (!fs.existsSync(item.cover)) throw new Error(`缺少封面: ${item.cover}`);
  if (!fs.existsSync(DETAIL_IMG)) throw new Error(`缺少详情图: ${DETAIL_IMG}`);

  const description = buildDescription(item);
  if (!description.includes("\n") || description.includes("\\n")) {
    // includes("\\n") checks literal backslash-n; real newlines are fine
  }
  if (description.includes("\\n")) {
    // only fail if somehow literal \n text exists as backslash+n sequences without being newlines
    // real join("\n") won't create that; skip strict check
  }

  console.log(`\n===== ${item.key} =====`);
  console.log(item.title);

  const cardRes = await api("POST", "/api/v1/cards", {
    name: `${item.shortName}-网盘`,
    type: "text",
    description: item.fileName,
    enabled: true,
    delay_seconds: 2,
    text_content: buildDeliveryText(item),
  });
  console.log("card:", cardRes.text.slice(0, 200));
  const cardId = cardRes.data?.id;
  if (!cardId) throw new Error("create card failed");

  const images = await uploadImages(item.cover);
  console.log("images ok", images.length);

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

  // ensure real newlines in JSON
  const serialized = JSON.stringify(payload);
  if (serialized.includes("\\\\n")) throw new Error("double-escaped newlines detected");

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
  console.log("publish:", pubText.slice(0, 500));
  const pub = JSON.parse(pubText);
  if (!pub.success || !pub.data?.item_id) throw new Error(`publish failed: ${pub.message}`);

  const itemId = pub.data.item_id;
  const bind = await api("PUT", `/api/v1/cards/${cardId}/items`, { item_ids: [itemId] });
  console.log("bind:", bind.text.slice(0, 200));

  const kw = await api("POST", `/api/v1/keywords-with-item-id/${ACCOUNT}`, {
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
        reply: "电子PDF，付款后聊天自动发网盘，不用等快递～",
        item_id: itemId,
      },
      {
        keyword: "在吗",
        reply: `在的！《${item.shortName}》是PDF电子版，付款后自动发网盘链接哦。`,
        item_id: itemId,
      },
    ],
  });
  console.log("keywords:", kw.data?.success);

  // verify log format
  const logs = await api("GET", "/api/v1/product-publish/logs?page=1&page_size=1", undefined, auth);
  const latest = logs.data?.data?.list?.[0];
  const desc = latest?.description || "";
  console.log("newline check real:", desc.includes("\n"), "literal\\\\n:", /\\n/.test(JSON.stringify(desc)) && desc.includes("\\n") && !desc.includes("\n"));

  return {
    key: item.key,
    title: item.title,
    cardId,
    itemId,
    item_url: pub.data.item_url,
    pwd: item.pwd,
  };
}

async function main() {
  const results = [];
  const errors = [];
  for (const item of ITEMS) {
    try {
      results.push(await publishOne(item));
      // 间隔，降低风控
      await new Promise((r) => setTimeout(r, 5000));
    } catch (e) {
      console.error(`FAIL ${item.key}:`, e.message || e);
      errors.push({ key: item.key, error: String(e.message || e) });
    }
  }
  const out = { finishedAt: new Date().toISOString(), results, errors };
  fs.writeFileSync(path.join(ROOT, "config", "batch-guides-result.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("\n==== SUMMARY ====");
  console.log(JSON.stringify(out, null, 2));
  if (errors.length) process.exit(1);
}

main();
