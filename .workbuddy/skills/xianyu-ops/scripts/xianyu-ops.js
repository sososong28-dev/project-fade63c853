#!/usr/bin/env node
const { emit, errorEnvelope, OpsError, parseArgs, successEnvelope } = require("./lib/core");
const { marketCommand } = require("./lib/market");
const { draftListingCommand } = require("./lib/content");
const { draftRepliesCommand } = require("./lib/replies");
const { dailyReportCommand, doctorCommand } = require("./lib/operations");

const COMMANDS = {
  help: {
    description: "列出全部只读和草稿命令",
    usage: "help",
    handler: async () => ({
      data: {
        commands: Object.entries(COMMANDS).map(([name, command]) => ({
          name,
          description: command.description,
          usage: command.usage,
        })),
        aliases: ALIASES,
        safety: "所有命令均不发布商品、不发送消息、不修改价格、不处理订单",
      },
    }),
  },
  doctor: {
    description: "检查服务、后台认证和账号连接状态",
    usage: "doctor [--fixture tests/fixtures/doctor.json]",
    handler: doctorCommand,
  },
  market: {
    description: "按关键词生成公开在售商品行情简报",
    usage: "market --keyword 机械键盘 [--page 1] [--page-size 20]",
    handler: marketCommand,
  },
  "draft-listing": {
    description: "根据本地 JSON 生成商品文案草稿，不发布",
    usage: "draft-listing --input examples/listing-input.json",
    handler: draftListingCommand,
  },
  "draft-replies": {
    description: "为未读会话生成回复草稿，不发送",
    usage: "draft-replies --account-id <闲鱼账号ID> [--limit 20] [--rules <rules.json>]",
    handler: draftRepliesCommand,
  },
  "daily-report": {
    description: "汇总本地经营数据，可选补充指定账号的数据罗盘",
    usage: "daily-report [--account-id <后台数字ID>] [--period recent1d]",
    handler: dailyReportCommand,
  },
};

const ALIASES = {
  巡检: "doctor",
  行情: "market",
  商品草稿: "draft-listing",
  回复草稿: "draft-replies",
  日报: "daily-report",
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requested = args._[0] || "help";
  const command = ALIASES[requested] || requested;
  const mode = args.fixture ? "fixture" : command === "draft-listing" || command === "help" ? "local" : "live";
  try {
    if (!COMMANDS[command]) {
      throw new OpsError("UNKNOWN_COMMAND", `未知命令: ${requested}`, "使用 help 查看支持的命令");
    }
    const result = await COMMANDS[command].handler(args);
    emit(successEnvelope(command, mode, result));
  } catch (error) {
    emit(errorEnvelope(command, mode, error));
    process.exitCode = 1;
  }
}

main();
