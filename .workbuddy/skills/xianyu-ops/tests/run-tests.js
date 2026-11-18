const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "scripts", "xianyu-ops.js");
const fixture = (name) => path.join(__dirname, "fixtures", name);
const example = (name) => path.join(ROOT, "examples", name);
let passed = 0;

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, expectedStatus, `命令退出码异常: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    assert.fail(`输出不是 JSON: ${result.stdout}\n${result.stderr}`);
  }
  assert.strictEqual(payload.meta.read_only, true);
  assert.strictEqual(payload.meta.external_writes, false);
  return payload;
}

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("help 仅注册只读和草稿命令", () => {
  const output = run(["help"]);
  const names = output.data.commands.map((command) => command.name);
  assert.deepStrictEqual(names.sort(), ["daily-report", "doctor", "draft-listing", "draft-replies", "help", "market"].sort());
  assert.strictEqual(output.data.aliases["巡检"], "doctor");
});

test("doctor 汇总健康状态且不自动修复", () => {
  const output = run(["doctor", "--fixture", fixture("doctor.json")]);
  assert.strictEqual(output.data.status, "healthy");
  assert.strictEqual(output.data.account_summary.connected, 2);
  assert.strictEqual(output.meta.mode, "fixture");
});

test("market 计算价格、供需和样本置信度", () => {
  const output = run(["market", "--keyword", "机械键盘", "--fixture", fixture("market.json")]);
  assert.strictEqual(output.data.summary.sample_size, 8);
  assert.strictEqual(output.data.summary.median_price, 44.9);
  assert.strictEqual(output.data.summary.confidence, "low");
  assert.strictEqual(output.data.price_bands.length, 4);
  assert.strictEqual(output.data.top_items[0].item_id, "8");
  assert.strictEqual(Object.hasOwn(output.data.top_items[0], "seller_name"), false);
  assert.strictEqual(Object.hasOwn(output.data.top_items[0], "raw_data"), false);
});

test("draft-listing 生成真实换行且保持草稿状态", () => {
  const output = run(["draft-listing", "--input", example("listing-input.json")]);
  assert.strictEqual(output.data.status, "draft");
  assert.strictEqual(output.data.requires_confirmation, true);
  assert.strictEqual(output.data.validation.real_newlines, true);
  assert.strictEqual(output.data.description.includes("\\n"), false);
  assert.ok(output.data.description.includes("【怎么交付】"));
});

test("draft-replies 只生成草稿并标记高风险意图", () => {
  const output = run(["回复草稿", "--fixture", fixture("replies.json")]);
  assert.strictEqual(output.command, "draft-replies");
  assert.strictEqual(output.data.summary.drafted, 3);
  assert.strictEqual(output.data.send_status, "not_sent");
  assert.ok(output.data.drafts.every((draft) => draft.requires_human && !draft.auto_send_allowed));
  assert.ok(output.data.drafts.some((draft) => draft.intent === "aftersale" && draft.risk_level === "high"));
});

test("daily-report 合并本地、订单和数据罗盘口径", () => {
  const output = run(["日报", "--fixture", fixture("daily.json")]);
  assert.strictEqual(output.data.overview.today_reply_count, 18);
  assert.strictEqual(output.data.overview.reply_delta, 6);
  assert.strictEqual(output.data.today.today_amount, 299.4);
  assert.strictEqual(output.data.seller_compass.latest.chatUv, 60);
  assert.ok(output.data.markdown.includes("闲鱼经营日报"));
});

test("未知写命令被拒绝", () => {
  const output = run(["publish"], 1);
  assert.strictEqual(output.ok, false);
  assert.strictEqual(output.error.code, "UNKNOWN_COMMAND");
});

test("实时行情缺少关键词时返回参数错误", () => {
  const output = run(["market"], 1);
  assert.strictEqual(output.ok, false);
  assert.strictEqual(output.error.code, "INVALID_ARGUMENT");
});

console.log(JSON.stringify({ ok: true, passed, external_requests: 0 }, null, 2));
