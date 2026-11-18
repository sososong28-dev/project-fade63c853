# 闲鱼自动化运营系统（二次开发版）

> **项目性质：本项目是基于 [zhinianboke/xianyu-auto-reply](https://github.com/zhinianboke/xianyu-auto-reply) 的二次开发版本，不是原作者官方仓库。**
>
> 底层项目源码、原始 README 和许可证均保留在本仓库中；二次开发在原有 FastAPI + React + MySQL + Redis + WebSocket + Scheduler + Playwright 系统上进行，原作者及许可证归属不变。

## 原项目文件

- 底层源码：[`xianyu-auto-reply/`](xianyu-auto-reply/)
- 原始项目说明：[`xianyu-auto-reply/README.md`](xianyu-auto-reply/README.md)
- 原项目许可证：[`xianyu-auto-reply/LICENSE`](xianyu-auto-reply/LICENSE)
- 上游仓库：[zhinianboke/xianyu-auto-reply](https://github.com/zhinianboke/xianyu-auto-reply)

底层目录保留上游源码快照并叠加本项目的二次开发改动；原始 README 用于保留上游项目说明，具体新增能力以本文件为准。

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
├── xianyu-auto-reply\     # 底层原项目源码、原始 README、LICENSE 与二次开发改动
├── scripts\api-client.js  # 运维 CLI（登录/扫码/卡券/客服/就绪检查）
├── scripts\health-auto.js # 计划任务入口（先 login 再巡检/重连）
├── docs\项目索引.md       # 值班入口、铁律、事故复盘
├── config\                # 配置模板与本地运行结果（凭据不入库）
├── .workbuddy\skills\     # WorkBuddy 独立运营与上架 Skill
└── .cursor\skills\        # Cursor 本地 Skill
```

## 二次开发内容

| 模块 | 本项目新增或调整的能力 |
|------|------------------------|
| WorkBuddy `xianyu-ops` | 只读运营、行情整理、上架草稿、回复草稿和本地日报 |
| WorkBuddy `xianyu-listing` | 人工预览与显式确认后的单品上架、图片哈希确认、幂等键、本地审计和重复发布保护 |
| 商品发布 | 缺少平台分类 ID 时，通过内部 `/category/recommend` 接口自动补全 |
| 稳定性 | 远程 Token 余额不足熔断、数据罗盘权限错误分类、前端健康检查修正 |
| 运维与安全 | 统一 JSON CLI、回归测试、凭据与本地运行数据排除规则 |

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
