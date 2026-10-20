---
name: xhs-copy-ref
description: >-
  小红书文案原则速查，用于改写闲鱼商品标题/描述/卡券话术。
  Use when rewriting 闲鱼文案、商品描述、上架话术、小红书风格标题。
---

# 小红书文案 → 闲鱼话术

## 来源

- https://github.com/JuneYaooo/xhs-writer-skill
- https://github.com/kane25/brand-xiaohongshu-copywriting-skill

## 结构模板

```text
{痛点一句}

{我整理了什么 / 个人视角一句}

【你能拿到什么】
{交付物，短句分行}

【怎么发货】
{付款后自动发网盘+提取码}
{转存 / 补发指引}

【小提示】
{版权与适用人群}
```

## 排版铁律

- 必须真实换行，禁止字面量 `\n` 字符串出现在页面上。
- 用脚本文件组装描述：`["行1","行2",""].join("\n")`。
- 发布后看日志：`JSON.stringify(description)` 里应是 `\n` 转义，不是 `\\n`。

## 标题公式（选用）

- 痛点+方案：`打怪总翻车？这份攻略PDF我整理好了`
- 身份+交付：`怪物猎人世界典藏攻略PDF｜拍下自动发网盘`
- 发现式：少用夸张「宝藏/绝了」堆砌，偏闲鱼成交语境
