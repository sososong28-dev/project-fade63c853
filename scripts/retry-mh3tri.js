/**
 * 单独重试：怪物猎人3tri（复用已建卡券 id=7）
 */
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:8089";
const ROOT = path.join(__dirname, "..");
const token = fs.readFileSync(path.join(__dirname, ".token"), "utf8").trim();
const auth = { Authorization: `Bearer ${token}` };
const jsonHeaders = { ...auth, "Content-Type": "application/json" };

const item = {
  shortName: "怪物猎人3tri攻略",
  title: "怪物猎人3tri攻略PDF｜拍下自动发网盘",
  hook: "想快速上手又懒得东翻西找？",
  what: "我整理的《怪物猎人3tri攻略》PDF电子版，一本查关键内容。",
  cover: path.join(ROOT, "config", "guide-mh3tri-cover.png"),
  detail: path.join(ROOT, "config", "guide-delivery-detail.png"),
  url: "https://pan.baidu.com/s/1FDi54KHUFeMTGpWWSiwOwQ?pwd=j6u1",
  pwd: "j6u1",
  cardId: 7,
};

const description = [
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

async function main() {
  await new Promise((r) => setTimeout(r, 8000));

  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(item.cover)], { type: "image/png" }), "cover.png");
  form.append("files", new Blob([fs.readFileSync(item.detail)], { type: "image/png" }), "detail.png");
  const upRes = await fetch(`${BASE}/api/v1/product-publish/upload/images`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const up = await upRes.json();
  if (!up.success) throw new Error(JSON.stringify(up));

  const payload = {
    account_id: "413198903",
    title: item.title,
    description,
    price: 1,
    original_price: 9.9,
    category: "其他闲置",
    images: up.data.paths,
    address: "广东省深圳市南山区",
    delivery_method: "express",
    postage: 0,
    condition: "全新",
  };

  console.log("publishing mh3tri retry...");
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
  console.log(pubText);
  const pub = JSON.parse(pubText);
  if (!pub.success || !pub.data?.item_id) throw new Error(pub.message || "fail");

  const itemId = pub.data.item_id;
  let r = await fetch(`${BASE}/api/v1/cards/${item.cardId}/items`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ item_ids: [itemId] }),
  });
  console.log("bind", await r.text());

  r = await fetch(`${BASE}/api/v1/keywords-with-item-id/413198903`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      keywords: [
        { keyword: "网盘", reply: "付款后会自动发百度网盘链接和提取码，稍等几秒～没收到回「补发」就行。", item_id: itemId },
        { keyword: "补发", reply: "好的，稍等，系统会按订单补发网盘；还没有的话把订单号发我。", item_id: itemId },
        { keyword: "怎么发货", reply: "电子PDF，付款后聊天自动发网盘，不用等快递～", item_id: itemId },
        { keyword: "在吗", reply: "在的！《怪物猎人3tri攻略》是PDF电子版，付款后自动发网盘链接哦。", item_id: itemId },
      ],
    }),
  });
  console.log("keywords", await r.text());

  const result = { key: "mh3tri", cardId: item.cardId, itemId, item_url: pub.data.item_url, title: item.title };
  const batchPath = path.join(ROOT, "config", "batch-guides-result.json");
  const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
  batch.results.push(result);
  batch.errors = (batch.errors || []).filter((e) => e.key !== "mh3tri");
  batch.retriedAt = new Date().toISOString();
  fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));
  console.log("DONE", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
