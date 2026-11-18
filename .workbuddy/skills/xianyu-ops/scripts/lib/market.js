const {
  OpsError,
  apiRequest,
  integerArg,
  median,
  numericValue,
  readJson,
  requireText,
  round,
} = require("./core");

function normalizeItem(item) {
  const price = numericValue(item.price ?? item.sale_price ?? item.salePrice ?? item.price_text);
  const wants = numericValue(item.want_count ?? item.wants ?? item.wantCount ?? item.want);
  const views = numericValue(item.view_count ?? item.views ?? item.browse_count ?? item.browseCount);
  return {
    item_id: String(item.item_id ?? item.itemId ?? item.id ?? ""),
    title: String(item.title ?? item.item_title ?? "未知标题"),
    price,
    wants: wants === null ? 0 : wants,
    views: views === null ? null : views,
    area: String(item.area ?? item.region ?? ""),
    url: String(item.item_url ?? item.url ?? ""),
    publish_time: String(item.publish_time ?? item.publishTime ?? ""),
  };
}

function buildPriceBands(items) {
  const priced = items.filter((item) => Number.isFinite(item.price)).sort((a, b) => a.price - b.price);
  if (priced.length < 4) return [];
  const bands = [];
  for (let index = 0; index < 4; index += 1) {
    const start = Math.floor((index * priced.length) / 4);
    const end = Math.floor(((index + 1) * priced.length) / 4);
    const group = priced.slice(start, end);
    if (!group.length) continue;
    const totalWants = group.reduce((sum, item) => sum + item.wants, 0);
    bands.push({
      min_price: round(group[0].price),
      max_price: round(group[group.length - 1].price),
      supply_count: group.length,
      total_wants: totalWants,
      median_wants: round(median(group.map((item) => item.wants)), 1),
      demand_supply_score: round(totalWants / (group.length + 1), 1),
    });
  }
  return bands;
}

function analyzeMarket(raw, keyword, page, pageSize) {
  const sourceItems = raw?.data?.items || raw?.items || [];
  if (!Array.isArray(sourceItems)) throw new OpsError("INVALID_RESPONSE", "搜索响应中的 items 不是数组");
  const items = sourceItems.map(normalizeItem).filter((item) => item.item_id || item.title !== "未知标题");
  const prices = items.map((item) => item.price).filter(Number.isFinite);
  const wants = items.map((item) => item.wants).filter(Number.isFinite);
  const sampleSize = items.length;
  const confidence = sampleSize < 20 ? "low" : sampleSize < 50 ? "medium" : "high";
  const warnings = [];
  if (sampleSize < 20) warnings.push("样本少于 20 条，结论只用于初步观察，不宜直接定价或大量铺货");
  if (prices.length < sampleSize) warnings.push(`${sampleSize - prices.length} 条商品缺少可解析价格，未纳入价格统计`);

  const topItems = items
    .slice()
    .sort((left, right) => right.wants - left.wants || (left.price || Infinity) - (right.price || Infinity))
    .slice(0, 10);
  const summary = {
    sample_size: sampleSize,
    priced_count: prices.length,
    min_price: prices.length ? round(Math.min(...prices)) : null,
    median_price: round(median(prices)),
    average_price: prices.length ? round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null,
    max_price: prices.length ? round(Math.max(...prices)) : null,
    median_wants: round(median(wants), 1),
    total_wants: wants.reduce((sum, value) => sum + value, 0),
    confidence,
  };
  const data = {
    keyword,
    scope: { page, requested_page_size: pageSize, actual_sample_size: sampleSize },
    summary,
    price_bands: buildPriceBands(items),
    top_items: topItems,
    interpretation_notes: [
      "样本来自当前关键词下的公开在售商品，不等同于实际成交数据",
      "demand_supply_score 为想要数与供给量的启发式比值，只用于候选价格带筛选",
    ],
  };
  data.markdown = [
    `# ${keyword} 行情简报`,
    "",
    `- 样本：${sampleSize} 条；有效价格：${prices.length} 条；置信度：${confidence}`,
    `- 价格区间：${summary.min_price ?? "-"} ~ ${summary.max_price ?? "-"} 元；中位价：${summary.median_price ?? "-"} 元`,
    `- 想要数中位数：${summary.median_wants ?? "-"}；累计想要数：${summary.total_wants}`,
    "",
    "该结果为单关键词、单页样本，只用于选品与内容测试参考。",
  ].join("\n");
  return { data, warnings };
}

async function marketCommand(args) {
  const page = integerArg(args.page, 1, { min: 1, max: 100, name: "page" });
  const pageSize = integerArg(args["page-size"], 20, { min: 1, max: 100, name: "page-size" });
  let keyword;
  let raw;
  if (args.fixture) {
    raw = readJson(args.fixture);
    keyword = String(args.keyword || raw.keyword || raw.data?.keyword || "离线样例").trim();
  } else {
    keyword = requireText(args.keyword || args._[1], "关键词，例如 --keyword 机械键盘");
    raw = await apiRequest("POST", "/api/v1/search/items", {
      body: { keyword, page, page_size: pageSize },
      timeoutMs: 120000,
    });
  }
  return analyzeMarket(raw, keyword, page, pageSize);
}

module.exports = { analyzeMarket, marketCommand, normalizeItem };
