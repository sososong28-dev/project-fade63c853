/**
 * 用小红书风格话术重新发布 MHW 攻略（真实换行，不再写字面量 \n）
 */
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:8089";
const token = fs.readFileSync(path.join(__dirname, ".token"), "utf8").trim();
const auth = { Authorization: `Bearer ${token}` };
const json = { ...auth, "Content-Type": "application/json" };

const TITLE = "怪物猎人世界典藏攻略PDF｜拍下自动发网盘";

// 闲鱼描述：真实换行；短段口语；痛点→卖点→发货→提示
const DESCRIPTION = [
  "打怪总翻车、配装看花眼？",
  "我把《怪物猎人世界》干货整理成一本典藏攻略PDF，随时能翻。",
  "",
  "【你能拿到什么】",
  "电子PDF，不是实体书。",
  "整理向攻略，方便检索查阅。",
  "",
  "【怎么发货】",
  "付款后几秒，聊天自动发百度网盘链接和提取码。",
  "收到后建议马上转存。",
  "没收到直接回：补发 或 网盘。",
  "",
  "【小提示】",
  "本人整理分享，游戏版权归原厂商。",
  "适合想快速上手、查配装思路的猎人。",
].join("\n");

async function req(method, urlPath, body, headers = json) {
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

async function main() {
  console.log("TITLE:", TITLE);
  console.log("DESC preview:\n" + DESCRIPTION);
  console.log("---");
  console.log("DESC has real newlines:", DESCRIPTION.includes("\n"));
  console.log("DESC has literal \\\\n:", DESCRIPTION.includes("\\n") && !DESCRIPTION.split("\n").length);

  // upload images
  const form = new FormData();
  for (const f of [
    path.join(__dirname, "..", "config", "mhw-guide-cover.png"),
    path.join(__dirname, "..", "config", "mhw-guide-detail.png"),
  ]) {
    form.append("files", new Blob([fs.readFileSync(f)], { type: "image/png" }), path.basename(f));
  }
  const upRes = await fetch(`${BASE}/api/v1/product-publish/upload/images`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const up = await upRes.json();
  console.log("upload:", up.success, up.message);
  if (!up.success) throw new Error("upload failed");

  const payload = {
    account_id: "413198903",
    title: TITLE,
    description: DESCRIPTION,
    price: 1,
    original_price: 9.9,
    category: "其他闲置",
    images: up.data.paths,
    address: "广东省深圳市南山区",
    delivery_method: "express",
    postage: 0,
    condition: "全新",
  };

  // sanity: ensure JSON serializes real newlines
  const serialized = JSON.stringify(payload);
  if (serialized.includes("\\\\n")) {
    throw new Error("payload still contains double-escaped newlines");
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "config", "mhw-xhs-copy-fixed.json"),
    JSON.stringify({ title: TITLE, description: DESCRIPTION }, null, 2),
    "utf8"
  );

  console.log("publishing...");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  const pubRes = await fetch(`${BASE}/api/v1/product-publish/publish/single`, {
    method: "POST",
    headers: json,
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  const pubText = await pubRes.text();
  console.log(pubText.slice(0, 2000));
  fs.writeFileSync(path.join(__dirname, "..", "config", "mhw-publish-fixed-result.json"), pubText);
  const pub = JSON.parse(pubText);
  if (!pub.success || !pub.data?.item_id) throw new Error("publish failed");

  const itemId = pub.data.item_id;

  // bind card 3 to new item only (primary)
  let r = await req("PUT", "/api/v1/cards/3/items", {
    item_ids: [itemId, "1068891487889", "1069722642006"],
  });
  console.log("bind:", r.text);

  // update delivery message tone
  r = await req("PUT", "/api/v1/cards/3", {
    name: "怪物猎人世界-典藏攻略本-网盘",
    type: "text",
    enabled: true,
    delay_seconds: 2,
    text_content: [
      "您好，感谢支持！",
      "",
      "《怪物猎人世界》典藏攻略本（PDF）网盘：",
      "https://pan.baidu.com/s/19gMWqYeUDjKghC3z27-EEQ?pwd=m9y9",
      "提取码：m9y9",
      "",
      "建议马上转存。没收到回「补发」就行～",
    ].join("\n"),
  });
  console.log("card:", r.text);

  // keywords
  r = await req("POST", "/api/v1/keywords-with-item-id/413198903", {
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
        reply: "在的！攻略是PDF电子版，付款后自动发网盘链接哦。",
        item_id: itemId,
      },
    ],
  });
  console.log("keywords:", r.text);

  // verify publish log stores real newlines
  r = await req("GET", "/api/v1/product-publish/logs?page=1&page_size=1", undefined, auth);
  const latest = r.data?.data?.list?.[0];
  console.log("latest log item_id:", latest?.item_id);
  console.log("latest log desc JSON:", JSON.stringify(latest?.description || "").slice(0, 400));
  const hasLiteral = (latest?.description || "").includes("\\n");
  const hasReal = (latest?.description || "").includes("\n");
  console.log("format check literal\\\\n:", hasLiteral, "realNewline:", hasReal);

  console.log(
    "DONE",
    JSON.stringify(
      {
        itemId,
        item_url: pub.data.item_url,
        title: TITLE,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
