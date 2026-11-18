# 命令参考

所有命令在工作区根目录 `D:\咸鱼自动化` 执行。实时模式读取项目根 `.env` 和已有 `scripts/.token`，不会自动登录。

## 查看帮助

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js help
```

支持中文别名：`巡检`、`行情`、`商品草稿`、`回复草稿`、`日报`。

## 巡检

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js doctor
```

检查 Backend、WebSocket、Scheduler、Frontend；有后台 Token 时继续检查认证与账号连接。只有 `/auth/verify` 明确返回 `authenticated=true` 才判定认证通过；Token 无效时提示人工重新登录，不继续请求账号接口。命令不会自动登录、重连或启用账号。

## 行情分析

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js market --keyword "机械键盘" --page 1 --page-size 20
```

- `page`：1 到 100。
- `page-size`：1 到 100，默认 20。
- 搜索可能耗时较长；遇到验证或风控错误时停止。
- `summary.confidence`：少于 20 条为 low，20 至 49 条为 medium，50 条及以上为 high。
- `demand_supply_score` 只是启发式筛选指标，不代表成交概率。

## 商品草稿

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js draft-listing --input .workbuddy/skills/xianyu-ops/examples/listing-input.json
```

输入字段：

- 必填：`product_name`、`price`、`selling_points`、`delivery_method`。
- 可选：`kind`（physical/virtual）、`title_hint`、`category`、`audience`、`condition`、`delivery_notes`、`notes`、`images`。

输出始终是 `status=draft`，不会创建素材或发布商品。

## 回复草稿

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js draft-replies --account-id "闲鱼账号ID" --limit 20
```

可选 `--rules <json>` 覆盖默认意图话术，格式见 `examples/reply-rules.json`。`account-id` 是聊天账号 ID，不是数据罗盘使用的数据库数字 ID。

## 经营日报

```bash
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js daily-report
node .workbuddy/skills/xianyu-ops/scripts/xianyu-ops.js daily-report --account-id 1 --period recent7d
```

- 默认读取本地账号、关键词、订单总量和回复统计。
- 今日订单明细依赖管理员权限；权限不足时降级并给出警告。
- 指定数字 `account-id` 后读取该账号的数据罗盘；`period` 支持 recent1d、recent7d、recent30d。
- 数据罗盘无权限时不进行无效重试，`data_quality.seller_compass_error_code=PERMISSION_DENIED`，保留本地统计并提示人工确认商家后台权限。

## 离线样例

每个读取接口的命令都支持 `--fixture <json>`，用于无账号、无后台情况下的开发验证。离线样例只用于测试，不得当作真实经营结果汇报。
