# 上架命令

在工作区根目录执行。无需也不应执行 `doctor`。

## 人工预览

```bash
node .workbuddy/skills/xianyu-listing/scripts/xianyu-listing.js publish --input <商品.json>
```

返回 `status=awaiting_confirmation` 和 `review_id`。此阶段只读取 JSON 与图片，不上传、不发布、不写审计。

## 确认上架

```bash
node .workbuddy/skills/xianyu-listing/scripts/xianyu-listing.js publish --input <商品.json> --confirm <review_id>
```

依次调用：

1. `POST /api/v1/product-publish/upload/images`：上传 1–9 张本地图片。
2. `POST /api/v1/product-publish/publish/single`：同步发布单个商品，超时 240 秒。

确认码同时覆盖商品字段和图片内容。修改任何已巡检内容后必须重新预览和确认。

## 输入字段

必填：`account_id`、`title`、`description`、`price`、`category`、`images`、`address`。

可选：`original_price`、`delivery_method`（express/pickup，默认 express）、`postage`（默认 0）、`condition`（默认全新）、`brand`。

图片支持 png/jpg/jpeg/webp，每张不超过 5MB，最多 9 张。相对路径以工作区根目录解析。

不允许卡券、关键词、自动发货、批量账号或其他额外字段。

## 返回与重试

成功返回 `item_id`、`item_url`、`log_id`、`review_id`。同一 `review_id` 已成功时直接返回上次结果，`duplicate_prevented=true`，不调用外部接口。

网络超时、响应异常或缺少 item_id 时返回 `PUBLISH_UNCERTAIN`，不得直接重试；先人工到闲鱼后台核查。普通明确失败会记录审计，但仍需每次人工命令触发，不自动重试。
