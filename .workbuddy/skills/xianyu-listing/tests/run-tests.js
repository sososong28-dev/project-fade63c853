const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CLI = path.join(__dirname, "..", "scripts", "xianyu-listing.js");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xianyu-listing-test-"));
const imagePath = path.join(tempDir, "cover.png");
const inputPath = path.join(tempDir, "listing.json");
const auditPath = path.join(tempDir, "audit.jsonl");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
fs.writeFileSync(imagePath, png);
const listing = {
  account_id: "loopback-account",
  title: "本地上架测试商品",
  description: "仅用于本地回环测试，不是真实商品。",
  price: 9.9,
  original_price: 19.9,
  category: "测试分类",
  images: [imagePath],
  address: "广东省深圳市南山区",
  delivery_method: "express",
  postage: 0,
  condition: "全新",
};
fs.writeFileSync(inputPath, JSON.stringify(listing), "utf8");
let requests = [];
let passed = 0;

const server = http.createServer((request, response) => {
  request.on("data", () => {});
  request.on("end", () => {
    let body = null;
    if (request.url === "/api/v1/product-publish/publish/single") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      body = null;
    }
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (request.url === "/api/v1/product-publish/upload/images") {
      response.end(JSON.stringify({ success: true, data: { paths: ["/server/uploaded-cover.png"] } }));
      return;
    }
    if (request.url === "/api/v1/product-publish/category/recommend") {
      response.end(JSON.stringify({
        success: true,
        data: {
          candidates: [
            {
              cat_id: "50025387",
              cat_name: "测试分类",
              channel_cat_id: "126864985",
              channel_cat_name: "测试渠道分类",
              tb_cat_id: "50005050",
              is_selected: true,
            },
          ],
        },
      }));
      return;
    }
    if (request.url === "/api/v1/product-publish/publish/single") {
      if (request.headers.authorization === "Bearer uncertain-test-token") {
        response.end("not-json");
        return;
      }
      if (request.headers.authorization === "Bearer failure-test-token") {
        response.end(JSON.stringify({ success: false, message: "模拟明确发布失败" }));
        return;
      }
      response.end(JSON.stringify({
        success: true,
        data: {
          item_id: "123456",
          item_url: "https://www.goofish.com/item?id=123456",
          log_id: 9,
        },
      }));
      return;
    }
    response.end(JSON.stringify({ success: false, message: "unexpected endpoint" }));
  });
});

function run(args, token = "loopback-test-token") {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        ...process.env,
        XIANYU_API_BASE: `http://127.0.0.1:${address.port}`,
        XIANYU_TOKEN: token,
        XIANYU_LISTING_AUDIT_FILE: auditPath,
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

function test(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

server.listen(0, "127.0.0.1", async () => {
  try {
    const help = await run(["help"]);
    assert.strictEqual(help.code, 0, help.stderr);
    assert.deepStrictEqual(help.payload.data.commands.map((item) => item.name).sort(), ["help", "publish"]);
    assert.ok(help.payload.data.excluded.includes("doctor"));
    test("仅注册 publish/help，不包含 doctor");

    const preview = await run(["publish", "--input", inputPath]);
    assert.strictEqual(preview.code, 0, preview.stderr);
    assert.strictEqual(preview.payload.data.status, "awaiting_confirmation");
    assert.match(preview.payload.data.review_id, /^[a-f0-9]{64}$/);
    assert.strictEqual(preview.payload.meta.external_writes, false);
    assert.strictEqual(requests.length, 0);
    assert.strictEqual(fs.existsSync(auditPath), false);
    const reviewId = preview.payload.data.review_id;
    test("默认预览不上传、不发布、不写审计");

    const mismatch = await run(["publish", "--input", inputPath, "--confirm", "wrong"], "loopback-test-token");
    assert.strictEqual(mismatch.code, 1);
    assert.strictEqual(mismatch.payload.error.code, "CONFIRMATION_MISMATCH");
    assert.strictEqual(mismatch.payload.meta.external_writes, false);
    assert.strictEqual(requests.length, 0);
    test("确认码错误时零外部请求");

    const published = await run(["publish", "--input", inputPath, "--confirm", reviewId]);
    assert.strictEqual(published.code, 0, published.stderr);
    assert.strictEqual(published.payload.data.status, "published");
    assert.strictEqual(published.payload.data.item_id, "123456");
    assert.strictEqual(published.payload.data.duplicate_prevented, false);
    assert.strictEqual(published.payload.meta.external_writes, true);
    assert.strictEqual(requests.length, 3);
    assert.deepStrictEqual(requests.map((item) => item.url), [
      "/api/v1/product-publish/upload/images",
      "/api/v1/product-publish/category/recommend",
      "/api/v1/product-publish/publish/single",
    ]);
    assert.strictEqual(requests[2].headers["idempotency-key"], reviewId);
    test("确认后执行图片上传、分类推荐和单品发布");

    const duplicate = await run(["publish", "--input", inputPath, "--confirm", reviewId]);
    assert.strictEqual(duplicate.code, 0, duplicate.stderr);
    assert.strictEqual(duplicate.payload.data.duplicate_prevented, true);
    assert.strictEqual(duplicate.payload.meta.external_writes, false);
    assert.strictEqual(requests.length, 3);
    test("相同内容成功记录阻止重复上架");

    fs.writeFileSync(imagePath, Buffer.concat([png, Buffer.from("changed")]));
    const changedPreview = await run(["publish", "--input", inputPath]);
    assert.notStrictEqual(changedPreview.payload.data.review_id, reviewId);
    const oldConfirmation = await run(["publish", "--input", inputPath, "--confirm", reviewId]);
    assert.strictEqual(oldConfirmation.code, 1);
    assert.strictEqual(oldConfirmation.payload.error.code, "CONFIRMATION_MISMATCH");
    assert.strictEqual(requests.length, 3);
    test("图片变更使旧确认码失效");

    const unsupportedPath = path.join(tempDir, "unsupported.json");
    fs.writeFileSync(unsupportedPath, JSON.stringify({ ...listing, card_id: 1 }), "utf8");
    const unsupported = await run(["publish", "--input", unsupportedPath]);
    assert.strictEqual(unsupported.code, 1);
    assert.strictEqual(unsupported.payload.error.code, "UNSUPPORTED_FIELD");
    assert.strictEqual(requests.length, 3);
    test("卡券等额外动作字段被拒绝");

    fs.writeFileSync(imagePath, png);
    const failureInput = path.join(tempDir, "failure.json");
    fs.writeFileSync(failureInput, JSON.stringify({ ...listing, title: "明确失败测试" }), "utf8");
    const failurePreview = await run(["publish", "--input", failureInput], "failure-test-token");
    const failed = await run([
      "publish", "--input", failureInput, "--confirm", failurePreview.payload.data.review_id,
    ], "failure-test-token");
    assert.strictEqual(failed.code, 1);
    assert.strictEqual(failed.payload.error.code, "BUSINESS_ERROR");
    assert.strictEqual(failed.payload.meta.external_writes, true);
    const audit = fs.readFileSync(auditPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert.strictEqual(audit[audit.length - 1].status, "failed");
    assert.strictEqual(audit[audit.length - 1].stage, "publish");
    test("明确业务失败不误报成功并保留审计");

    const uncertainInput = path.join(tempDir, "uncertain.json");
    fs.writeFileSync(uncertainInput, JSON.stringify({ ...listing, title: "结果不确定测试" }), "utf8");
    const uncertainPreview = await run(["publish", "--input", uncertainInput], "uncertain-test-token");
    const uncertainArgs = [
      "publish", "--input", uncertainInput, "--confirm", uncertainPreview.payload.data.review_id,
    ];
    const uncertain = await run(uncertainArgs, "uncertain-test-token");
    assert.strictEqual(uncertain.code, 1);
    assert.strictEqual(uncertain.payload.error.code, "PUBLISH_UNCERTAIN");
    const beforeBlockedRetry = requests.length;
    const blockedRetry = await run(uncertainArgs, "uncertain-test-token");
    assert.strictEqual(blockedRetry.code, 1);
    assert.strictEqual(blockedRetry.payload.error.code, "PUBLISH_RECONCILIATION_REQUIRED");
    assert.strictEqual(requests.length, beforeBlockedRetry);
    test("结果不确定时禁止未经人工核查的重复上架");

    console.log(JSON.stringify({ ok: true, passed, network_scope: "loopback", real_publish_calls: 0 }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
