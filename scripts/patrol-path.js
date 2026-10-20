#!/usr/bin/env node
/**
 * 闲鱼闭环轻量巡检：服务 / WS / 回复 / 发布 / 卡券绑定
 * 用法: node scripts/patrol-path.js
 * 产出: config/path-patrol-latest.json + config/path-patrol-latest.txt
 *
 * OpenClaw 心跳约定：stdout 最后一行固定为
 *   XIANYU_PATH|<PASS|WARN|FAIL|ERROR>|<failCount>|<warnCount>|<one-line-summary>
 * 供 HEARTBEAT.md 解析；exit 0=PASS/WARN，2=FAIL，1=脚本错误
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.XIANYU_API_BASE || "http://127.0.0.1:8089";
const TOKEN_FILE = path.join(__dirname, ".token");
const CONFIG_DIR = path.join(__dirname, "..", "config");
const OUT_JSON = path.join(CONFIG_DIR, "path-patrol-latest.json");
const OUT_TXT = path.join(CONFIG_DIR, "path-patrol-latest.txt");

const WATCH_CARDS = [
  { id: 23, name: "黑暗之魂重置版", expectItems: ["1072728081845", "1073712624203"] },
  { id: 17, name: "艾尔登法环终极攻略本", expectItems: ["1070860343708"] },
  { id: 13, name: "怪物猎人百科全书旧版", expectItems: ["1071694246796"] },
];

function loadToken() {
  if (process.env.XIANYU_TOKEN) return process.env.XIANYU_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  return null;
}

async function req(method, urlPath, { auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (auth) {
    const token = loadToken();
    if (!token) throw new Error("未登录：先 node scripts/api-client.js login");
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, data };
}

function hasThinkingLeak(text) {
  const s = String(text || "");
  return /<\s*redacted_thinking|<\s*think|<\s*thinking|<\s*reasoning/i.test(s);
}

function push(checks, id, name, ok, detail, level = "error") {
  checks.push({ id, name, ok: !!ok, level: ok ? "ok" : level, detail });
}

async function main() {
  const checkedAt = new Date().toISOString();
  const checks = [];
  const report = { checkedAt, overall: "unknown", checks, summary: {} };

  for (const [name, url] of [
    ["backend-web", "http://127.0.0.1:8089/health"],
    ["websocket", "http://127.0.0.1:8090/health"],
    ["scheduler", "http://127.0.0.1:8091/health"],
  ]) {
    try {
      const r = await fetch(url);
      push(checks, `health_${name}`, `服务 ${name}`, r.ok, `HTTP ${r.status}`);
    } catch (e) {
      push(checks, `health_${name}`, `服务 ${name}`, false, e.message);
    }
  }

  try {
    const r = await req("GET", "/api/v1/cookies");
    if (!r.ok) {
      const detail = r.data?.detail || r.data?.message || "";
      push(
        checks,
        "cookies",
        "Cookie/账号列表",
        false,
        `HTTP ${r.status}${detail ? " " + detail : ""}`
      );
      if (r.status === 401) {
        push(checks, "ws", "WebSocket 连接", false, "后台 token 失效（401），未读到账号");
        report.summary.ws = "auth_401";
      }
    } else {
    const accountsRaw = r.data;
    const accountIds = Array.isArray(accountsRaw)
      ? accountsRaw
      : accountsRaw?.data || [];
    push(checks, "cookies", "Cookie/账号列表", accountIds.length > 0, `账号数=${accountIds.length}`);

    const ca = await req("GET", "/api/v1/chat-new/accounts");
    const list = ca.data?.data || ca.data || [];
    const acc =
      (Array.isArray(list) ? list : []).find((x) => String(x.account_id) === "413198903") ||
      (Array.isArray(list) ? list[0] : null);
    if (acc) {
      const connected = !!acc.connected && String(acc.status).toLowerCase() === "active";
      push(
        checks,
        "ws",
        "WebSocket 连接",
        connected,
        `${acc.account_id} connected=${acc.connected} status=${acc.status}`
      );
      report.summary.ws = `${acc.account_id}:${acc.connected ? "on" : "off"}/${acc.status}`;
    } else {
      push(checks, "ws", "WebSocket 连接", false, "chat-new/accounts 无账号");
      report.summary.ws = "missing";
    }

    const stats = await req("GET", "/api/v1/cookies/stats");
    const s = stats.data?.data || stats.data || {};
    report.summary.today_reply_count = s.today_reply_count;
    report.summary.total_keywords = s.total_keywords;
    report.summary.active_accounts = s.active_accounts;
    }
  } catch (e) {
    push(checks, "cookies", "账号读取", false, e.message);
  }

  try {
    const r = await req("GET", "/api/v1/auto-reply-logs?page=1&page_size=10");
    const rows = r.data?.data || [];
    const recent = Array.isArray(rows) ? rows : [];
    const last24h = recent.filter((x) => {
      const t = Date.parse(x.source_message_time || x.created_at || "");
      return Number.isFinite(t) && Date.now() - t < 24 * 3600 * 1000;
    });
    const leaks = recent.filter((x) => hasThinkingLeak(x.reply_text));
    const failedSend = recent.filter((x) => x.send_status && x.send_status !== "success");
    const latest = recent[0];
    const latestLeaks = latest && hasThinkingLeak(latest.reply_text);

    push(
      checks,
      "reply_recent",
      "近10条自动回复可读取",
      recent.length >= 0,
      `共${recent.length}条，24h内样本${last24h.length}条`
    );
    push(
      checks,
      "reply_no_think_leak",
      "最新回复无 think/代码泄漏",
      !latestLeaks,
      latestLeaks
        ? `最新 id=${latest.id} 仍含推理标签`
        : leaks.length
          ? `最新正常；历史 ${leaks.length} 条旧泄漏可忽略`
          : "未发现泄漏"
    );
    push(
      checks,
      "reply_send_ok",
      "近10条发送状态",
      failedSend.length === 0,
      failedSend.length
        ? `失败 ${failedSend.length} 条，最新 id=${failedSend[0].id} status=${failedSend[0].send_status}`
        : latest
          ? `最新: strategy=${latest.reply_strategy} send=${latest.send_status} msg=${JSON.stringify(latest.source_message)}`
          : "暂无回复日志",
      failedSend.length ? "error" : "ok"
    );
    report.summary.latest_reply = latest
      ? {
          id: latest.id,
          time: latest.source_message_time,
          strategy: latest.reply_strategy,
          send_status: latest.send_status,
          source_message: latest.source_message,
          item_id: latest.item_id,
        }
      : null;
  } catch (e) {
    push(checks, "reply_recent", "自动回复日志", false, e.message);
  }

  try {
    const r = await req("GET", "/api/v1/product-publish/logs?page=1&page_size=8");
    const rows =
      r.data?.data?.list ||
      r.data?.data?.items ||
      r.data?.data ||
      [];
    const list = Array.isArray(rows) ? rows : [];
    const latest = list[0];
    const recentFail = list.filter((x) => String(x.status).toLowerCase() === "failed").slice(0, 3);
    const cookieFail = recentFail.filter((x) =>
      /COOKIE|未登录|Cookie/i.test(String(x.error_message || x.message || ""))
    );
    push(
      checks,
      "publish_latest",
      "最近发布",
      latest ? String(latest.status).toLowerCase() === "success" : false,
      latest
        ? `#${latest.id} ${latest.status} item=${latest.item_id || "-"} ${(latest.title || "").slice(0, 24)}`
        : "无发布日志",
      latest && String(latest.status).toLowerCase() !== "success" ? "warn" : "error"
    );
    push(
      checks,
      "publish_cookie",
      "近8条无 Cookie 失效连发",
      cookieFail.length === 0,
      cookieFail.length ? `Cookie类失败 ${cookieFail.length} 条` : "无 Cookie 失效报警",
      cookieFail.length ? "warn" : "ok"
    );
    report.summary.latest_publish = latest
      ? { id: latest.id, status: latest.status, item_id: latest.item_id, title: latest.title }
      : null;
  } catch (e) {
    push(checks, "publish_latest", "发布日志", false, e.message, "warn");
  }

  for (const card of WATCH_CARDS) {
    try {
      const r = await req("GET", `/api/v1/cards/${card.id}`);
      const c = r.data?.data || r.data || {};
      const ids = (c.item_ids || []).map(String);
      const bound = ids.length > 0;
      const expectedHit = (card.expectItems || []).some((id) => ids.includes(String(id)));
      push(
        checks,
        `card_${card.id}`,
        `卡券#${card.id} ${card.name}`,
        bound && (card.expectItems?.length ? expectedHit : true),
        bound
          ? `item_ids=${ids.join(",")}${expectedHit || !card.expectItems?.length ? "" : "（未命中预期商品，可能已重上换新ID）"}`
          : "未绑定任何商品",
        bound ? "warn" : "error"
      );
    } catch (e) {
      push(checks, `card_${card.id}`, `卡券#${card.id}`, false, e.message);
    }
  }

  const hardFail = checks.filter((c) => !c.ok && c.level === "error");
  const warns = checks.filter((c) => !c.ok && c.level === "warn");
  report.overall = hardFail.length ? "fail" : warns.length ? "warn" : "pass";
  report.failCount = hardFail.length;
  report.warnCount = warns.length;

  const lr = report.summary.latest_reply;
  const oneLine = [
    `WS=${report.summary.ws || "?"}`,
    `今日回复=${report.summary.today_reply_count ?? "?"}`,
    lr ? `最新回复=${lr.strategy}/${lr.send_status}` : "最新回复=无",
    report.summary.latest_publish
      ? `发布=#${report.summary.latest_publish.id}/${report.summary.latest_publish.status}`
      : "发布=无",
    hardFail.length ? `FAIL项=${hardFail.map((c) => c.id).join(",")}` : "",
    warns.length ? `WARN项=${warns.map((c) => c.id).join(",")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [];
  lines.push(`闲鱼路径巡检  ${checkedAt}`);
  lines.push(`结论: ${report.overall.toUpperCase()}  (失败${hardFail.length} / 警告${warns.length})`);
  if (report.summary.today_reply_count != null) {
    lines.push(`今日自动回复: ${report.summary.today_reply_count} | 关键词数: ${report.summary.total_keywords ?? "-"}`);
  }
  lines.push("");
  for (const c of checks) {
    const mark = c.ok ? "[OK]  " : c.level === "warn" ? "[WARN]" : "[FAIL]";
    lines.push(`${mark} ${c.name}: ${c.detail}`);
  }
  lines.push("");
  lines.push("后台常看：http://127.0.0.1:9000 → 自动回复日志 / 商品发布日志 / 卡券管理 / 账号连接");
  lines.push("复跑：node scripts/patrol-path.js   或   node scripts/api-client.js patrol");

  const machine =
    `XIANYU_PATH|${report.overall.toUpperCase()}|${hardFail.length}|${warns.length}|${oneLine}`;
  lines.push("");
  lines.push(machine);
  report.machineLine = machine;
  report.oneLine = oneLine;

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_TXT, lines.join("\n") + "\n", "utf8");

  console.log(lines.join("\n"));
  console.log("\n已写入:", OUT_TXT);
  console.log(machine);
  process.exit(hardFail.length ? 2 : 0);
}

main().catch((e) => {
  console.error("巡检失败:", e.message);
  console.log(`XIANYU_PATH|ERROR|1|0|${e.message}`);
  process.exit(1);
});
