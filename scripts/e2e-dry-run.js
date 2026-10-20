/**
 * 端到端干跑：验证本机可自动完成的环节，并标出需真人扫码/下单的步骤。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const outFile = path.join(root, "config", "e2e-dry-run-report.json");

function run(args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "api-client.js"), ...args], {
    encoding: "utf8",
    cwd: root,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || "").slice(-4000),
    stderr: (r.stderr || "").slice(-1000),
  };
}

function main() {
  const report = {
    ranAt: new Date().toISOString(),
    steps: [],
  };

  const checks = [
    { id: 1, name: "服务健康", args: ["health"], assert: (o) => o.includes('"ok": true') },
    { id: 2, name: "后台登录", args: ["login"], assert: (o) => o.includes("登录成功") },
    { id: 3, name: "卡券库存", args: ["cards"], assert: (o) => /"total":\s*[1-9]/.test(o) },
    { id: 4, name: "扫码会话可生成", args: ["qr-generate"], assert: (o) => o.includes("session_id") },
    { id: 5, name: "就绪报告", args: ["readiness"], assert: (o) => o.includes("checkedAt") },
  ];

  for (const c of checks) {
    const result = run(c.args);
    const text = result.stdout + result.stderr;
    const passed = result.ok && c.assert(text);
    report.steps.push({
      id: c.id,
      name: c.name,
      passed,
      note: passed ? "自动通过" : "失败，见 stdout",
      excerpt: text.slice(0, 300),
    });
  }

  report.manualRemaining = [
    "闲鱼 App 扫码接入卖家账号（config/qr-login.png 或 http://127.0.0.1:9000）",
    "wait-account 后确认 WebSocket chat-accounts 在线",
    "同步/发布测试商品并 bind-card",
    "买家询价关键词命中",
    "付款后自动收到卡密/链接",
  ];

  report.summary = {
    autoPassed: report.steps.filter((s) => s.passed).length,
    autoTotal: report.steps.length,
    blockedOn: "真实闲鱼账号扫码（当前 cookies 为空）",
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.autoPassed < report.summary.autoTotal) process.exit(1);
}

main();
