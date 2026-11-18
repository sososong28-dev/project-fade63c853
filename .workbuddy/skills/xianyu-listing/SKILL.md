---
name: xianyu-listing
description: 在人工巡检商品文字、价格、账号、分类、地址和全部图片后，通过显式确认码执行单个闲鱼商品上架。适用于用户明确要求“上架/发布商品”且已有完整 JSON 输入的场景；不执行 doctor、行情、日报、回复、卡券、关键词或自动发货。
agent_created: true
---

# Xianyu Listing

## Overview

仅负责人工确认后的单商品上架。将人工巡检与系统执行分离：人工负责内容和合规检查，系统负责图片上传与单品发布。不得把 `doctor` 或任何自动巡检作为前置步骤。

## Workflow

1. 复制 `examples/listing-input.json`，填写真实商品与本地图片路径。
2. 运行不带确认码的命令，获取 `review_id`：

```bash
node .workbuddy/skills/xianyu-listing/scripts/xianyu-listing.js publish --input <商品.json>
```

3. 人工核对预览中的全部商品字段和图片哈希。任何文字、价格、账号或图片变化都会生成新的 `review_id`。
4. 用户明确确认实际发布后，运行：

```bash
node .workbuddy/skills/xianyu-listing/scripts/xianyu-listing.js publish --input <商品.json> --confirm <review_id>
```

5. 检查 `item_id`、`item_url` 和 `log_id`。相同内容成功上架后再次执行会直接返回原结果，不重复调用接口。

## Guardrails

- 未携带正确 `--confirm` 时，禁止调用上传、发布或任何其他外部接口。
- 只允许输入约定中的上架字段；拒绝卡券、关键词、自动发货和批量发布字段。
- 使用 `review_id` 作为请求幂等键，并写入本地审计。当前后端不保证服务端幂等，本地成功记录用于防止重复执行。
- 遇到 `pending`、`uncertain`、执行锁或审计损坏时停止，要求人工核查，不得自动重试。
- 不在输出或审计中记录后台 Token、Cookie 或密码。

详见 `references/commands.md` 和 `references/guardrails.md`。
