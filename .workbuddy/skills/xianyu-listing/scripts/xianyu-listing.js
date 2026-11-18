#!/usr/bin/env node
const {
  OpsError,
  emit,
  errorEnvelope,
  parseArgs,
  successEnvelope,
} = require("./lib/core");
const { publishCommand } = require("./lib/publish");

function help() {
  return {
    data: {
      purpose: "人工巡检并确认后，只执行单个闲鱼商品上架",
      commands: [
        {
          name: "publish",
          read_only: false,
          usage: "publish --input <json> [--confirm <review_id>]",
          note: "不带 confirm 仅预览；确认后仅上传商品图片并调用单品发布，不包含其他运营动作",
        },
        { name: "help", read_only: true, usage: "help" },
      ],
      aliases: { "上架": "publish" },
      excluded: ["doctor", "market", "daily-report", "draft-replies", "cards", "keywords", "delivery"],
    },
    warnings: [],
    meta: { mode: "local", read_only: true, external_writes: false },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const requested = argv[0] && !argv[0].startsWith("--") ? argv[0] : "help";
  const aliases = { "上架": "publish" };
  const command = aliases[requested] || requested;
  const args = parseArgs(argv.slice(1));
  const confirmed = Boolean(args.confirm);
  try {
    if (command === "help") {
      const result = help();
      emit(successEnvelope("help", result.data, result.warnings, result.meta));
      return;
    }
    if (command !== "publish") {
      throw new OpsError("UNKNOWN_COMMAND", `未注册命令: ${requested}`, "此 Skill 只提供 publish/上架");
    }
    const result = await publishCommand(args);
    emit(successEnvelope("publish", result.data, result.warnings, result.meta));
  } catch (error) {
    emit(errorEnvelope(command, error, {
      mode: confirmed ? "live" : "local",
      read_only: !confirmed,
      external_writes: error.externalWrites === true,
    }));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  emit(errorEnvelope("unknown", error));
  process.exitCode = 1;
});
