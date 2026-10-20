#!/usr/bin/env node
/**
 * 闲鱼健康检查自动化入口（供计划任务调用）
 * - 先刷新后台 JWT（token 过期会 401，巡检误报账号为空且无法重连）
 * - 跑巡检
 * - 若 WS 断开：enable + connect 一次后复检
 * - 追加一行到 config/path-patrol-history.log
 *
 * 用法: node scripts/health-auto.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");
const HISTORY = path.join(CONFIG_DIR, "path-patrol-history.log");
const LATEST_JSON = path.join(CONFIG_DIR, "path-patrol-latest.json");
const ACCOUNT = process.env.XIANYU_ACCOUNT_ID || "413198903";

function runNode(args, inherit = true) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
}

function sleepSec(sec) {
  spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Start-Sleep -Seconds ${Number(sec) || 4}`],
    { stdio: "ignore" }
  );
}

function readOverall() {
  try {
    const j = JSON.parse(fs.readFileSync(LATEST_JSON, "utf8"));
    return {
      overall: String(j.overall || "unknown").toUpperCase(),
      machineLine: j.machineLine || "",
      oneLine: j.oneLine || "",
      ws: j.summary?.ws || "",
      failCount: j.failCount ?? 0,
    };
  } catch {
    return { overall: "ERROR", machineLine: "", oneLine: "", ws: "", failCount: 1 };
  }
}

function appendHistory(line) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.appendFileSync(HISTORY, `${new Date().toISOString()} ${line}\n`, "utf8");
}

function wsOffline(meta) {
  const ws = String(meta.ws || "");
  if (ws === "auth_401") return false;
  if (ws.includes(":off/") || ws === "missing") return true;
  const line = String(meta.machineLine || "");
  return /\bFAIL项=[^\n]*\bws\b/i.test(line) || /WS=[^ ]*:off\//i.test(line);
}

function main() {
  console.log(`[health-auto] start account=${ACCOUNT}`);

  console.log("[health-auto] refresh admin token");
  const login = runNode([path.join(__dirname, "api-client.js"), "login"], true);
  if (login.status) {
    console.log("[health-auto] login exit=", login.status);
    appendHistory(`login_failed XIANYU_PATH|ERROR|1|0|login exit=${login.status}`);
    process.exit(1);
  }

  let r = runNode([path.join(__dirname, "patrol-path.js")], true);
  let meta = readOverall();
  let action = "check";

  if (wsOffline(meta)) {
    console.log("[health-auto] WS offline → enable + connect");
    // 重启/掉线后账号常变成 disabled，需先启用再 connect
    const en = runNode(
      [path.join(__dirname, "api-client.js"), "enable-account", ACCOUNT, "true"],
      true
    );
    if (en.status) console.log("[health-auto] enable-account exit=", en.status);
    const conn = runNode([path.join(__dirname, "api-client.js"), "connect", ACCOUNT], true);
    if (conn.status) console.log("[health-auto] connect exit=", conn.status);
    sleepSec(4);
    r = runNode([path.join(__dirname, "patrol-path.js")], true);
    meta = readOverall();
    action = wsOffline(meta) ? "reconnect_failed" : "reconnected";
  }

  const hist = `${action} ${meta.machineLine || `XIANYU_PATH|${meta.overall}|?|?|`}`;
  appendHistory(hist);
  console.log(`[health-auto] done action=${action} overall=${meta.overall}`);
  console.log(meta.machineLine || "");

  if (meta.overall === "FAIL" || meta.overall === "ERROR") process.exit(2);
  if (typeof r.status === "number" && r.status === 1) process.exit(1);
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error("[health-auto] fatal:", e.message);
  appendHistory(`fatal ${e.message}`);
  process.exit(1);
}
