/**
 * 闲鱼自动回复系统 - 本地运维 API 客户端
 * 用法见文件底部或: node api-client.js help
 */
const fs = require("fs");
const path = require("path");

// 已存在的环境变量优先，项目根 .env 只补缺
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}
loadDotEnv(path.join(__dirname, "..", ".env"));

const BASE = process.env.XIANYU_API_BASE || "http://127.0.0.1:8089";
const TOKEN_FILE = path.join(__dirname, ".token");
const CONFIG_DIR = path.join(__dirname, "..", "config");

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function loadToken() {
  if (process.env.XIANYU_TOKEN) return process.env.XIANYU_TOKEN;
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  return null;
}

async function request(method, urlPath, body, { auth = true } = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth) {
    const token = loadToken();
    if (!token) throw new Error("未登录：请先运行 node api-client.js login");
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${method} ${urlPath}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function login(username, password) {
  username = username || process.env.XIANYU_API_USERNAME;
  password = password || process.env.XIANYU_API_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "缺少后台登录凭据：请设置环境变量 XIANYU_API_USERNAME 和 XIANYU_API_PASSWORD（可写入项目根 .env），或运行 node api-client.js login <username> <password>"
    );
  }
  const data = await request(
    "POST",
    "/api/v1/auth/login",
    { username, password },
    { auth: false }
  );
  const token =
    data?.data?.access_token ||
    data?.access_token ||
    data?.data?.token ||
    data?.token;
  if (!token) {
    console.error("登录响应无法解析 token:", JSON.stringify(data, null, 2));
    process.exit(1);
  }
  fs.writeFileSync(TOKEN_FILE, token, "utf8");
  console.log("登录成功，token 已写入", TOKEN_FILE);
  return data;
}

async function health() {
  const endpoints = [
    ["backend-web", "http://127.0.0.1:8089/health"],
    ["websocket", "http://127.0.0.1:8090/health"],
    ["scheduler", "http://127.0.0.1:8091/health"],
    ["frontend", "http://127.0.0.1:9000/"],
  ];
  const out = {};
  for (const [name, url] of endpoints) {
    try {
      const res = await fetch(url);
      out[name] = { ok: res.ok, status: res.status, body: await res.text().then((t) => t.slice(0, 200)) };
    } catch (e) {
      out[name] = { ok: false, error: String(e.message || e) };
    }
  }
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function listCookies() {
  const data = await request("GET", "/api/v1/cookies");
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cookiesStats() {
  const data = await request("GET", "/api/v1/cookies/stats");
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function qrGenerate() {
  const data = await request("POST", "/api/v1/qr-login/generate");
  const outFile = path.join(CONFIG_DIR, "qr-login-session.json");
  saveJson(outFile, { generatedAt: new Date().toISOString(), ...data });
  const qrUrl = data?.data?.qr_code_url || data?.qr_code_url;
  if (qrUrl && qrUrl.startsWith("data:image")) {
    const b64 = qrUrl.replace(/^data:image\/\w+;base64,/, "");
    const pngPath = path.join(CONFIG_DIR, "qr-login.png");
    fs.writeFileSync(pngPath, Buffer.from(b64, "base64"));
    console.log("二维码图片已保存:", pngPath);
  }
  console.log("扫码会话已保存:", outFile);
  console.log(JSON.stringify(data, null, 2));
  const sessionId =
    data?.data?.session_id ||
    data?.session_id ||
    data?.data?.sessionId ||
    data?.data?.id;
  if (sessionId) {
    console.log("\n轮询状态: node api-client.js qr-status", sessionId);
    console.log("等待扫码完成: node api-client.js wait-account", sessionId);
    console.log("前端也可打开 http://127.0.0.1:9000 使用「扫码登录」");
  }
  return data;
}

async function qrStatus(sessionId) {
  if (!sessionId) throw new Error("需要 session_id");
  const data = await request("GET", `/api/v1/qr-login/status/${sessionId}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function createDemoCards() {
  const keypoolFile = path.join(CONFIG_DIR, "demo-keys.txt");
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(keypoolFile)) {
    fs.writeFileSync(
      keypoolFile,
      [
        "DEMO-KEY-001-测试卡密请勿用于真实售卖",
        "DEMO-KEY-002-测试卡密请勿用于真实售卖",
        "DEMO-KEY-003-测试卡密请勿用于真实售卖",
        "DEMO-KEY-004-测试卡密请勿用于真实售卖",
        "DEMO-KEY-005-测试卡密请勿用于真实售卖",
      ].join("\n") + "\n",
      "utf8"
    );
  }
  const keys = fs.readFileSync(keypoolFile, "utf8").trim();

  const keyCard = await request("POST", "/api/v1/cards", {
    name: "虚拟品-卡密池(测试)",
    type: "data",
    description: "一对一消耗卡密，付款后自动发第一行",
    enabled: true,
    delay_seconds: 2,
    data_content: keys,
  });
  console.log("已创建卡密池卡券:", JSON.stringify(keyCard, null, 2));

  const linkCard = await request("POST", "/api/v1/cards", {
    name: "虚拟品-网盘链接(测试)",
    type: "text",
    description: "可复用网盘链接模板",
    enabled: true,
    delay_seconds: 2,
    text_content:
      "您好，资料已备好：\n链接：https://example.com/demo-virtual-goods\n提取码：xy99\n请尽快下载保存，祝使用愉快！",
  });
  console.log("已创建链接卡券:", JSON.stringify(linkCard, null, 2));

  saveJson(path.join(CONFIG_DIR, "demo-cards.json"), {
    createdAt: new Date().toISOString(),
    keyCard,
    linkCard,
    note: "创建卡券后，在后台「卡券管理」把卡券绑定到具体商品 item_id；或使用 bind-card 命令",
  });
  return { keyCard, linkCard };
}

async function listCards() {
  const data = await request("GET", "/api/v1/cards?page=1&page_size=50");
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function seedKeywords(accountId) {
  if (!accountId) throw new Error("需要 account_id，例如: node api-client.js seed-keywords my-account");
  const payload = {
    keywords: [
      {
        keyword: "你好",
        reply: "您好，这是自动客服。虚拟商品拍下付款后会自动发货，请稍等几秒～",
        item_id: null,
      },
      {
        keyword: "在吗",
        reply: "在的！虚拟资料付款后自动发货，有问题直接发消息即可。",
        item_id: null,
      },
      {
        keyword: "怎么发货",
        reply: "拍下并完成付款后，系统会自动把卡密/链接发到本聊天窗口，无需催促。",
        item_id: null,
      },
      {
        keyword: "卡密",
        reply: "卡密在您付款成功后自动发送。若超时未收到，请回复「补发」。",
        item_id: null,
      },
      {
        keyword: "补发",
        reply: "已记录您的补发请求。请稍等，系统会按订单自动补发；若仍未收到请留下订单号。",
        item_id: null,
      },
    ],
  };
  const data = await request("POST", `/api/v1/keywords-with-item-id/${encodeURIComponent(accountId)}`, payload);
  console.log(JSON.stringify(data, null, 2));
  saveJson(path.join(CONFIG_DIR, `keywords-${accountId}.json`), { accountId, payload, result: data });
  return data;
}

async function seedDefaultReply(accountId) {
  if (!accountId) throw new Error("需要 account_id");
  const body = {
    enabled: true,
    reply_type: "text",
    reply_content:
      "您好，我是自动客服。本店出售虚拟商品：付款后自动发货（卡密/链接）。常见问题可回复：怎么发货 / 卡密 / 补发。",
    reply_image: "",
  };
  const data = await request("PUT", `/api/v1/default-replies/${encodeURIComponent(accountId)}`, body);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function bindCardToItems(cardId, itemIdsCsv) {
  if (!cardId || !itemIdsCsv) throw new Error("用法: node api-client.js bind-card <cardId> <itemId1,itemId2>");
  const item_ids = itemIdsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const data = await request("PUT", `/api/v1/cards/${cardId}/items`, { item_ids });
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function chatAccounts() {
  const data = await request("GET", "/api/v1/chat-new/accounts");
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function connectAccount(accountId) {
  if (!accountId) throw new Error("需要 account_id");
  const data = await request("POST", `/api/v1/chat-new/connect/${encodeURIComponent(accountId)}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function enableAccount(accountId, enabled = true) {
  if (!accountId) throw new Error("需要 account_id");
  const data = await request("PUT", `/api/v1/cookies/${encodeURIComponent(accountId)}/status`, {
    enabled: Boolean(enabled),
  });
  console.log(JSON.stringify(data, null, 2));
  return data;
}

/** 复活账号：启用 → 连接；若仍离线则引导扫码 */
async function reviveAccount(accountId = "413198903") {
  console.log("1) 尝试启用账号", accountId);
  try {
    await enableAccount(accountId, true);
  } catch (e) {
    console.log("启用失败:", e.message);
  }
  console.log("2) 尝试连接 WebSocket");
  try {
    await connectAccount(accountId);
  } catch (e) {
    console.log("连接失败:", e.message);
  }
  const accounts = await request("GET", "/api/v1/chat-new/accounts");
  const row = (accounts?.data || []).find((a) => a.account_id === accountId) || (accounts?.data || [])[0];
  console.log("账号状态:", JSON.stringify(row, null, 2));
  if (row?.connected && row?.status === "active") {
    console.log("✅ 账号已在线，无需扫码");
    return row;
  }
  console.log("3) Cookie/会话无效，生成扫码二维码…");
  const qr = await qrGenerate();
  const sessionId = qr?.data?.session_id || qr?.session_id;
  console.log("请用闲鱼 App 扫描 config/qr-login.png");
  console.log("扫码后执行: node scripts/api-client.js wait-account", sessionId || "<sessionId>");
  return { needQr: true, sessionId, qr };
}

function extractAccountList(cookiesResp) {
  if (Array.isArray(cookiesResp)) return cookiesResp;
  if (Array.isArray(cookiesResp?.data)) return cookiesResp.data;
  if (Array.isArray(cookiesResp?.data?.items)) return cookiesResp.data.items;
  if (Array.isArray(cookiesResp?.items)) return cookiesResp.items;
  return [];
}

function extractAccountId(account) {
  return account?.id || account?.account_id || account?.cookie_id || account?.cookieId || null;
}

async function waitAccount(sessionId, timeoutSec = 300) {
  const started = Date.now();
  console.log(`等待扫码登录成功（最多 ${timeoutSec}s）...`);
  if (!sessionId) {
    throw new Error("需要 sessionId：先跑 revive-account / qr-generate");
  }
  console.log("扫码会话:", sessionId);
  console.log("二维码图片:", path.join(CONFIG_DIR, "qr-login.png"));

  while ((Date.now() - started) / 1000 < timeoutSec) {
    let qrStatus = null;
    try {
      const st = await request("GET", `/api/v1/qr-login/status/${sessionId}`);
      qrStatus = st?.data?.status || st?.status;
      console.log("qr-status:", qrStatus || JSON.stringify(st).slice(0, 120));
    } catch (e) {
      console.log("qr-status 查询失败:", e.message);
    }

    const qrOk =
      qrStatus === "success" ||
      qrStatus === "confirmed" ||
      qrStatus === "completed" ||
      qrStatus === "logged_in";

    if (qrStatus === "verification_required") {
      console.log("需要人脸验证：请用闲鱼 App 扫描 config/qr-face-verify.png");
    }

    if (qrOk) {
      console.log("扫码成功，正在启用并连接账号...");
      // 给后端一点时间写 Cookie
      await new Promise((r) => setTimeout(r, 2000));
      const cookies = await request("GET", "/api/v1/cookies");
      const list = extractAccountList(cookies);
      let accountId = list.length ? extractAccountId(list[0]) : null;
      if (!accountId) {
        const accounts = await request("GET", "/api/v1/chat-new/accounts");
        accountId = (accounts?.data || [])[0]?.account_id || "413198903";
      }
      saveJson(path.join(CONFIG_DIR, "active-account.json"), {
        detectedAt: new Date().toISOString(),
        accountId,
        qrStatus,
      });
      try {
        await enableAccount(accountId, true);
      } catch (e) {
        console.log("启用:", e.message);
      }
      console.log("自动配置客服话术...");
      try {
        await seedKeywords(accountId);
        await seedDefaultReply(accountId);
      } catch (e) {
        console.log("话术配置:", e.message);
      }
      try {
        await connectAccount(accountId);
      } catch (e) {
        console.log("connect:", e.message);
      }
      const accounts = await request("GET", "/api/v1/chat-new/accounts");
      const row =
        (accounts?.data || []).find((a) => a.account_id === accountId) ||
        (accounts?.data || [])[0];
      console.log("最终账号状态:", JSON.stringify(row, null, 2));
      if (row?.connected) {
        console.log("✅ WebSocket 已连接");
      } else {
        console.log("⚠️ 扫码完成但仍未连接，请检查后台 Cookie/风控");
      }
      return row || { accountId, qrStatus };
    }

    // 有指定 sessionId 时，必须以该扫码结果为准，不能因旧 WS 在线就提前返回
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("超时仍未扫码成功。请重新: node scripts/api-client.js revive-account");
}

async function setupAfterAccount(accountId) {
  if (!accountId) {
    const active = path.join(CONFIG_DIR, "active-account.json");
    if (fs.existsSync(active)) {
      accountId = JSON.parse(fs.readFileSync(active, "utf8")).accountId;
    }
  }
  if (!accountId) throw new Error("需要 accountId，或先 wait-account 生成 config/active-account.json");
  await seedKeywords(accountId);
  await seedDefaultReply(accountId);
  try {
    await connectAccount(accountId);
  } catch (e) {
    console.log("connect:", e.message);
  }
  console.log("账号客服配置完成:", accountId);
}

async function readiness() {
  const report = {
    checkedAt: new Date().toISOString(),
    health: await health(),
    loggedIn: false,
    accounts: null,
    cards: null,
    blockers: [],
    nextSteps: [],
  };

  try {
    await request("GET", "/api/v1/auth/verify");
    report.loggedIn = true;
  } catch {
    report.blockers.push("后台未登录或 token 失效，请运行: node scripts/api-client.js login");
  }

  if (report.loggedIn) {
    try {
      report.accounts = await request("GET", "/api/v1/cookies");
      const list =
        report.accounts?.data?.items ||
        report.accounts?.data ||
        report.accounts?.items ||
        (Array.isArray(report.accounts) ? report.accounts : []);
      const count = Array.isArray(list) ? list.length : list?.length || 0;
      if (!count) {
        report.blockers.push("尚未接入闲鱼账号。请打开 http://127.0.0.1:9000 扫码登录，或运行: node scripts/api-client.js qr-generate");
        report.nextSteps.push("扫码登录闲鱼卖家账号（建议小号）");
      } else {
        report.nextSteps.push("确认账号 WebSocket 已连接：node scripts/api-client.js chat-accounts");
      }
    } catch (e) {
      report.blockers.push("读取账号列表失败: " + e.message);
    }

    try {
      report.cards = await request("GET", "/api/v1/cards?page=1&page_size=20");
      const cards =
        report.cards?.data?.items ||
        report.cards?.data?.list ||
        report.cards?.data ||
        [];
      const n = Array.isArray(cards) ? cards.length : 0;
      if (!n) {
        report.nextSteps.push("创建测试卡券: node scripts/api-client.js seed-cards");
      } else {
        report.nextSteps.push("将卡券绑定到商品 item_id，并配置关键词客服");
      }
    } catch (e) {
      report.blockers.push("读取卡券失败: " + e.message);
    }
  }

  report.nextSteps.push("在闲鱼上架/同步一件测试虚拟品，绑定卡券后自测下单");
  saveJson(path.join(CONFIG_DIR, "readiness-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function e2eChecklist() {
  const checklist = {
    title: "虚拟品闭环自测清单",
    steps: [
      { id: 1, name: "服务健康", cmd: "node scripts/api-client.js health", doneHint: "四项 ok=true" },
      { id: 2, name: "后台登录", cmd: "node scripts/api-client.js login", doneHint: "token 写入成功" },
      { id: 3, name: "接入闲鱼账号", cmd: "浏览器打开 http://127.0.0.1:9000 扫码，或 qr-generate", doneHint: "cookies 列表非空且 WS 已连接" },
      { id: 4, name: "导入卡密/链接卡券", cmd: "node scripts/api-client.js seed-cards", doneHint: "卡券管理可见两条测试卡券" },
      { id: 5, name: "同步或发布测试商品", cmd: "后台「商品管理」拉取账号商品，或「商品发布」", doneHint: "拿到 item_id" },
      { id: 6, name: "绑定卡券到商品", cmd: "node scripts/api-client.js bind-card <cardId> <itemId>", doneHint: "商品已关联卡券" },
      { id: 7, name: "配置客服话术", cmd: "node scripts/api-client.js seed-keywords <accountId> && seed-default-reply <accountId>", doneHint: "关键词与默认回复生效" },
      { id: 8, name: "询价测试", manual: "用另一账号对商品发「在吗」「怎么发货」", doneHint: "自动回复命中" },
      { id: 9, name: "付款发货测试", manual: "拍下付款（可用低价测试品）", doneHint: "聊天收到卡密/链接，订单变为已发货" },
      { id: 10, name: "补发验证", manual: "回复「补发」或后台手动发货", doneHint: "可再次收到内容且不重复错发" },
    ],
  };
  saveJson(path.join(CONFIG_DIR, "e2e-checklist.json"), checklist);
  console.log(JSON.stringify(checklist, null, 2));
  await readiness();
  return checklist;
}

async function runPathPatrol() {
  const { spawnSync } = require("child_process");
  const script = path.join(__dirname, "patrol-path.js");
  const r = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if (typeof r.status === "number" && r.status !== 0) process.exit(r.status);
}

const commands = {
  help: async () => {
    console.log(`用法: node api-client.js <command> [args]

命令:
  help
  health
  login [username] [password]   (缺省读取 XIANYU_API_USERNAME / XIANYU_API_PASSWORD)
  readiness
  e2e-checklist
  status
  check
  patrol
  health-auto
  cookies
  cookies-stats
  qr-generate
  qr-status <sessionId>
  seed-cards
  cards
  seed-keywords <accountId>
  seed-default-reply <accountId>
  bind-card <cardId> <itemId1,itemId2>
  chat-accounts
  connect <accountId>
  enable-account <accountId> [true|false]
  revive-account [accountId]
  wait-account [sessionId] [timeoutSec]
  setup-after-account [accountId]
`);
  },
  health,
  login: async () => login(process.argv[3], process.argv[4]),
  readiness,
  "e2e-checklist": e2eChecklist,
  status: async () => runPathPatrol(),
  check: async () => runPathPatrol(),
  patrol: async () => runPathPatrol(),
  "health-auto": async () => {
    const { spawnSync } = require("child_process");
    const script = path.join(__dirname, "health-auto.js");
    const r = spawnSync(process.execPath, [script], { stdio: "inherit" });
    if (typeof r.status === "number" && r.status !== 0) process.exit(r.status);
  },
  cookies: listCookies,
  "cookies-stats": cookiesStats,
  "qr-generate": qrGenerate,
  "qr-status": async () => qrStatus(process.argv[3]),
  "seed-cards": createDemoCards,
  cards: listCards,
  "seed-keywords": async () => seedKeywords(process.argv[3]),
  "seed-default-reply": async () => seedDefaultReply(process.argv[3]),
  "bind-card": async () => bindCardToItems(process.argv[3], process.argv[4]),
  "chat-accounts": chatAccounts,
  connect: async () => connectAccount(process.argv[3]),
  "enable-account": async () =>
    enableAccount(process.argv[3], process.argv[4] !== "false"),
  "revive-account": async () => reviveAccount(process.argv[3] || "413198903"),
  "wait-account": async () => waitAccount(process.argv[3], Number(process.argv[4] || 300)),
  "setup-after-account": async () => setupAfterAccount(process.argv[3]),
};

async function main() {
  const cmd = process.argv[2] || "help";
  const fn = commands[cmd];
  if (!fn) {
    console.error("未知命令:", cmd);
    await commands.help();
    process.exit(1);
  }
  try {
    await fn();
  } catch (e) {
    console.error("失败:", e.message);
    if (e.data) console.error(JSON.stringify(e.data, null, 2));
    process.exit(1);
  }
}

main();
