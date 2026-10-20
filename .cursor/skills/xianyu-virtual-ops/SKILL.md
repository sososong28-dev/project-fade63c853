---
name: xianyu-virtual-ops
description: >-
  运营闲鱼虚拟商品自动化（上架、客服话术、卡密/链接发货）。
  封装本地已部署的 xianyu-auto-reply 后台 API。
  Use when the user mentions 闲鱼、咸鱼、虚拟品、自动发货、卡密、客服回复、上架、goofish、xianyu ops.
---

# 闲鱼虚拟品运营 Skill

工作区根目录：`D:\咸鱼自动化`。主系统在 `xianyu-auto-reply\`，运维入口为 `scripts/api-client.js`。

## 快速检查

```bash
node scripts/api-client.js health
node scripts/api-client.js login
node scripts/api-client.js readiness
node scripts/api-client.js patrol
```

后台：http://127.0.0.1:9000 （账号 `<REDACTED>`，脚本读取 `XIANYU_API_USERNAME` / `XIANYU_API_PASSWORD`，见项目根 `.env.example`）

## 健康巡检（计划任务）

- 任务名：`Xianyu_PathHealth_4x`，每天 9/12/15/18
- 入口：`scripts/health-auto.cmd` → `scripts/health-auto.js`
- **每次必须先 `login` 再巡检/重连**。后台 JWT 过期会 401，巡检会误报「账号数=0 / WS missing / 卡券未绑定」，且 `enable`/`connect` 全部失败。
- WebSocket 掉线后账号常变成 `disabled`，自愈顺序：login → enable → connect → 复检。
- Cookie 本身失效时 connect 救不回来，需扫码：`node scripts/api-client.js revive-account`
- 日志：`config/path-patrol-latest.txt`、`config/path-patrol-history.log`
- 项目索引：`docs/项目索引.md`

## 账号接入（WebSocket）

1. `node scripts/api-client.js qr-generate` → 生成 `config/qr-login.png`
2. 闲鱼 App 扫码，或浏览器打开管理后台扫码
3. `node scripts/api-client.js wait-account <sessionId>` → 检测到账号后自动写入关键词与默认回复，并尝试 connect
4. 校验：`node scripts/api-client.js cookies` / `chat-accounts`

没有真实扫码时，不要伪造 Cookie；WS 收消息依赖有效登录态。

## 虚拟品库存与发货

```bash
node scripts/api-client.js seed-cards          # 卡密池(data) + 链接(text)
node scripts/api-client.js cards
node scripts/api-client.js bind-card <cardId> <itemId>
```

卡券类型：
- `data`：一行一码，自动消耗
- `text`：固定文案（网盘链接）
- `api`：外部接口发卡

真实卡密写到 `config/demo-keys.txt` 后重新 `seed-cards`，或在后台卡券管理编辑。

## 客服话术

```bash
node scripts/api-client.js seed-keywords <accountId>
node scripts/api-client.js seed-default-reply <accountId>
```

预置关键词：你好 / 在吗 / 怎么发货 / 卡密 / 补发。

## 上架

优先用管理后台「商品发布 / 素材库」或「商品管理」从账号拉取已有商品拿 `item_id`，再 `bind-card`。

## 端到端

```bash
node scripts/api-client.js e2e-checklist
```

人工步骤：另一账号询价 → 付款 → 确认自动发货。可用 `POST /api/v1/orders/manual-delivery` 做补发。

## 上架文案（必读）

写标题/描述前先读项目规则 `.cursor/rules/xianyu-listing-copy.mdc` 与 skill `xhs-copy-ref`。

硬性要求：
- 描述用真实换行（`["a","b"].join("\n")`），禁止字面量 `\\n`
- 结构：痛点 → 我整理了什么 → 你能拿到什么 → 怎么发货 → 小提示
- 发布后检查 publish log 的 description 换行是否正确

示例脚本：`scripts/republish-mhw-fixed-copy.js`

## 原则

- 不重复实现发货引擎；一律调用已部署后台。
- 不绕过平台风控、不协助违规商品。
- 改配置后用 `readiness` 确认 blockers 清空。
