const assert = require("assert");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const CLI = path.join(__dirname, "..", "scripts", "xianyu-ops.js");
let accountRequests = 0;
let sellerSummaryRequests = 0;

const server = http.createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  if (request.url.startsWith("/api/v1/chat-new/accounts")) accountRequests += 1;
  if (request.url.startsWith("/api/v1/auth/verify")) {
    response.end(JSON.stringify({ authenticated: false }));
    return;
  }
  if (request.headers.authorization === "Bearer permission-test-token") {
    if (request.url.startsWith("/api/v1/cookies/stats")) {
      response.end(JSON.stringify({
        success: true,
        data: {
          total_accounts: 1,
          active_accounts: 1,
          total_orders: 2,
          total_keywords: 1,
          today_reply_count: 0,
          yesterday_reply_count: 0,
        },
      }));
      return;
    }
    if (request.url.startsWith("/api/v1/admin/stats/today")) {
      response.end(JSON.stringify({
        success: true,
        data: { today_orders: 1, today_shipped: 0, today_pending: 1, today_amount: 1 },
      }));
      return;
    }
    if (request.url.startsWith("/api/v1/data-analysis/seller-summary")) {
      sellerSummaryRequests += 1;
      response.end(JSON.stringify({
        success: false,
        error_code: "PERMISSION_DENIED",
        message: "PERMISSION_DENIED::账号无卖家数据罗盘权限，请在闲鱼商家后台确认并开通权限",
      }));
      return;
    }
  }
  if (request.headers.authorization === "Bearer expired-test-token") {
    response.end(JSON.stringify({ success: false, message: "Could not validate credentials" }));
    return;
  }
  response.end(JSON.stringify({ success: false, message: "模拟业务失败" }));
});

function runCli(args, token) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        ...process.env,
        XIANYU_API_BASE: `http://127.0.0.1:${address.port}`,
        XIANYU_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        resolve({ code, payload: JSON.parse(stdout), stderr });
      } catch (error) {
        reject(new Error(`输出不是 JSON: ${stdout}\n${stderr}`));
      }
    });
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    const business = await runCli(["daily-report"], "local-test-token");
    assert.strictEqual(business.code, 1, business.stderr);
    assert.strictEqual(business.payload.ok, false);
    assert.strictEqual(business.payload.error.code, "BUSINESS_ERROR");
    assert.strictEqual(business.payload.error.message, "模拟业务失败");
    assert.strictEqual(business.payload.meta.external_writes, false);

    const expired = await runCli(["daily-report"], "expired-test-token");
    assert.strictEqual(expired.code, 1, expired.stderr);
    assert.strictEqual(expired.payload.error.code, "AUTH_REQUIRED");
    assert.ok(expired.payload.error.hint.includes("人工重新登录"));

    const doctor = await runCli(["doctor"], "expired-test-token");
    assert.strictEqual(doctor.code, 0, doctor.stderr);
    assert.strictEqual(doctor.payload.data.authenticated, false);
    assert.strictEqual(doctor.payload.data.status, "degraded");
    assert.strictEqual(doctor.payload.data.account_summary, null);
    assert.ok(doctor.payload.warnings.some((warning) => warning.includes("Token 无效或已过期")));
    assert.strictEqual(accountRequests, 0, "Token 无效时不应继续请求账号接口");

    const permission = await runCli(["daily-report", "--account-id", "1"], "permission-test-token");
    assert.strictEqual(permission.code, 0, permission.stderr);
    assert.strictEqual(permission.payload.ok, true);
    assert.strictEqual(permission.payload.data.overview.total_orders, 2);
    assert.strictEqual(permission.payload.data.seller_compass, null);
    assert.strictEqual(permission.payload.data.data_quality.seller_compass_error_code, "PERMISSION_DENIED");
    assert.ok(permission.payload.warnings.some((warning) => warning.includes("账号无权限")));
    assert.strictEqual(sellerSummaryRequests, 1, "权限不足不应触发 CLI 重试");

    console.log(JSON.stringify({ ok: true, passed: 4, network_scope: "loopback" }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
