---
name: xianyu-ops
agent_created: true
description: 闲鱼运营只读与草稿工作流。用于巡检店铺服务、分析公开商品行情、生成商品文案草稿、为未读咨询生成回复草稿、输出经营日报。触发词包括闲鱼、咸鱼、goofish、巡检、行情、竞品分析、商品草稿、回复草稿、经营日报。不得用于直接发布、发送、改价或发货。
---

# 闲鱼运营 Skill

工作区根目录：`D:\咸鱼自动化`。

统一入口：

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js <command> [options]
```

## 安全边界

- 当前只提供 `doctor`、`market`、`draft-listing`、`draft-replies`、`daily-report` 五个业务命令。
- 所有输出均为 JSON，并带 `meta.read_only=true`、`meta.external_writes=false`。
- 不得把商品草稿当作已发布，不得把回复草稿当作已发送。
- 不调用 `/publish`、`/send-message`、改价、删除、补发、重连、启用账号等写接口。
- 遇到登录失效、验证码、RGV587 或风控提示时停止并报告，不尝试绕过。
- 不输出 Cookie、Token、密码、完整订单收货信息或无关买家个人信息。

## 命令路由

| 用户意图 | 命令 | 结果 |
|---|---|---|
| 巡检店铺、检查服务和账号状态 | `doctor` | 服务、认证、在线/禁用账号汇总；不自动修复 |
| 分析某关键词行情、价格带、竞品 | `market --keyword "<关键词>"` | 样本、价格统计、供需参考、头部商品 |
| 根据素材生成商品文案 | `draft-listing --input <json>` | 标题、真实换行描述、价格与合规提示 |
| 汇总未读咨询并起草回复 | `draft-replies --account-id <闲鱼账号ID>` | 意图、风险等级、建议回复；不发送 |
| 输出今日或近期经营情况 | `daily-report [--account-id <后台数字ID>]` | 本地经营统计，可选数据罗盘指标 |

详细参数见 `references/commands.md`，安全和降级规则见 `references/guardrails.md`。

## 推荐工作流

1. 实时操作前先执行 `doctor`。服务不可用时报告具体服务，不盲目重试。
2. 行情结论必须同时汇报样本量、采集时间和置信度，不把想要数说成成交量。
3. 商品草稿优先生成 JSON 输入，再运行命令；向用户展示标题、描述和校验提示。
4. 回复草稿应突出议价、售后、商品细节等需要人工判断的内容，不直接发送。
5. 经营日报分别说明本地统计与数据罗盘口径；可选数据失败时保留其他部分并列出警告。

## 本地验证

```bash
node .workbuddy/skills/xianyu-ops/tests/run-tests.js
```

测试只读取离线样例，不连接后台或闲鱼账号。
