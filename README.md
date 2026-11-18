# 闲鱼虚拟品自动化运营

基于 [zhinianboke/xianyu-auto-reply](https://github.com/zhinianboke/xianyu-auto-reply) 的本地部署，覆盖虚拟商品：**上架 → 客服 → 自动发货**。

## 访问地址

| 服务 | 地址 |
|------|------|
| 管理后台 | http://127.0.0.1:9000 |
| API / Swagger | http://127.0.0.1:8089/docs |
| WebSocket 服务 | http://127.0.0.1:8090/health |
| Scheduler | http://127.0.0.1:8091/health |

后台账号：`<REDACTED>`。脚本登录读取环境变量 `XIANYU_API_USERNAME` / `XIANYU_API_PASSWORD`（可复制 `.env.example` 为项目根 `.env` 填写，`.env` 不入库）；本地已关闭登录滑动验证，便于脚本运维。

## 目录说明

```text
D:\咸鱼自动化\
├── xianyu-auto-reply\     # 开源主系统（Docker 已启动）
├── scripts\api-client.js  # 运维 CLI（登录/扫码/卡券/客服/就绪检查）
├── scripts\health-auto.js # 计划任务入口（先 login 再巡检/重连）
├── docs\项目索引.md       # 值班入口、铁律、事故复盘
├── config\                # 配置模板与本地运行结果（凭据不入库）
├── .workbuddy\skills\     # WorkBuddy 独立运营与上架 Skill
└── .cursor\skills\        # Cursor 本地 Skill
```

## WorkBuddy Skill

- `xianyu-ops`：只读运营与草稿生成，不自动执行外部写操作。
- `xianyu-listing`：人工预览并显式确认后的单品上架；缺少平台分类 ID 时自动通过内部推荐接口补全。

```bash
# 只生成上架预览，不上传图片、不发布商品
node .workbuddy/skills/xianyu-listing/scripts/xianyu-listing.js publish --input <商品.json>

# 人工核对后，使用预览返回的 review_id 显式确认
node .workbuddy/skills/xianyu-listing/scripts/xianyu-listing.js publish --input <商品.json> --confirm <review_id>
```

上架 Skill 使用本地审计与幂等键防止重复发布；结果不确定时必须先人工核查，不得直接重试。`doctor` 不是上架前置条件。

> 版本说明：本仓库保存宿主机当前源码快照。既有容器镜像可能包含尚未回写到宿主机的文件；重建或替换容器前必须先做差异核验，不得直接用旧源码覆盖运行中的新功能。

## 一键运维命令

在 `D:\咸鱼自动化` 下执行：

```bash
node scripts/api-client.js health
node scripts/api-client.js login
node scripts/api-client.js qr-generate
# 用闲鱼 App 扫 config/qr-login.png，或打开 http://127.0.0.1:9000 扫码
node scripts/api-client.js wait-account <sessionId>
node scripts/api-client.js seed-cards
node scripts/api-client.js seed-keywords <accountId>
node scripts/api-client.js seed-default-reply <accountId>
node scripts/api-client.js bind-card <cardId> <itemId>
node scripts/api-client.js readiness
node scripts/api-client.js e2e-checklist
```

## 虚拟品推荐配置

| 交付方式 | 卡券 type | 说明 |
|----------|-----------|------|
| 卡密/激活码 | `data` | 一行一码，付款后消耗第一行 |
| 网盘链接 | `text` | 可复用固定文案 |
| 外部发卡 | `api` | 调用你自己的发卡接口 |

已预置测试卡券：
- id=`1` 卡密池（`config/demo-keys.txt`）
- id=`2` 网盘链接模板

绑定商品：`node scripts/api-client.js bind-card 1 <你的itemId>`

## Docker

```bash
cd xianyu-auto-reply
# Git Bash:
bash deploy.sh
# 或：
docker compose -f docker-compose.deploy.yml --env-file .env ps
docker compose -f docker-compose.deploy.yml --env-file .env logs -f
docker compose -f docker-compose.deploy.yml --env-file .env down
```

## 闭环自测

见 `config/e2e-checklist.json`。账号扫码接入后，用另一买家号：询价关键词 → 低价拍下付款 → 确认聊天收到卡密/链接。

## 注意

- 自动化有封号风险，先用小号验证。
- 虚拟品须符合闲鱼类目与平台规则。
- `scripts/.token` 含登录凭证，勿提交到公开仓库。
