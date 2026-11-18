const {
  DEFAULT_API_BASE,
  OpsError,
  apiRequest,
  asArray,
  beijingDate,
  healthRequest,
  integerArg,
  loadToken,
  readJson,
  round,
  safeCall,
} = require("./core");

function serviceEndpoints() {
  const base = DEFAULT_API_BASE.replace(/\/$/, "");
  return [
    { name: "backend-web", url: `${base}/health` },
    { name: "websocket", url: process.env.XIANYU_WS_HEALTH_URL || "http://127.0.0.1:8090/health" },
    { name: "scheduler", url: process.env.XIANYU_SCHEDULER_HEALTH_URL || "http://127.0.0.1:8091/health" },
    { name: "frontend", url: process.env.XIANYU_FRONTEND_HEALTH_URL || "http://127.0.0.1:9000/" },
  ];
}

async function doctorCommand(args) {
  if (args.fixture) {
    const fixture = readJson(args.fixture);
    return summarizeDoctor(fixture.services || [], fixture.authenticated === true, fixture.accounts || []);
  }

  const services = await Promise.all(
    serviceEndpoints().map(async (service) => ({ ...service, ...(await healthRequest(service.url)) }))
  );
  const warnings = [];
  let authenticated = false;
  let accounts = [];
  if (!loadToken()) {
    warnings.push("未找到后台 Token；服务健康已检查，账号状态未检查");
  } else {
    const auth = await safeCall("后台认证", () => apiRequest("GET", "/api/v1/auth/verify"));
    authenticated = auth.ok && auth.data?.authenticated === true;
    if (!auth.ok) warnings.push(auth.error);
    else if (!authenticated) warnings.push("后台 Token 无效或已过期，请人工重新登录");
    if (authenticated) {
      const accountResult = await safeCall("账号状态", () => apiRequest("GET", "/api/v1/chat-new/accounts?page_size=100"));
      if (accountResult.ok) accounts = asArray(accountResult.data?.data || accountResult.data);
      else warnings.push(accountResult.error);
    }
  }
  const result = summarizeDoctor(services, authenticated, accounts);
  result.warnings.unshift(...warnings);
  return result;
}

function summarizeDoctor(services, authenticated, accounts) {
  const normalizedAccounts = accounts.map((account) => ({
    account_id: String(account.account_id || account.id || ""),
    status: String(account.status || "unknown"),
    connected: Boolean(account.connected || account.online),
  }));
  const offline = normalizedAccounts.filter((account) => !account.connected);
  const disabled = normalizedAccounts.filter((account) => ["inactive", "disabled", "suspended"].includes(account.status));
  const allServicesHealthy = services.every((service) => service.ok);
  const healthy = allServicesHealthy && authenticated && normalizedAccounts.length > 0 && offline.length === 0 && disabled.length === 0;
  const recommendations = [];
  if (!allServicesHealthy) recommendations.push("先检查未通过服务的 Docker 状态和日志，不要自动重启或重连账号");
  if (!authenticated) recommendations.push("后台认证不可用时可运行 node scripts/api-client.js login；本命令不会自动登录");
  if (!normalizedAccounts.length && authenticated) recommendations.push("尚未读取到闲鱼账号，请在现有后台完成账号接入");
  if (offline.length) recommendations.push("存在离线账号；先人工确认 Cookie 和风控状态，再决定是否重连");
  if (disabled.length) recommendations.push("存在禁用账号；请核查禁用原因，不要自动启用");

  return {
    data: {
      status: healthy ? "healthy" : "degraded",
      services,
      authenticated,
      account_summary: authenticated
        ? {
            total: normalizedAccounts.length,
            connected: normalizedAccounts.length - offline.length,
            offline: offline.length,
            disabled: disabled.length,
            accounts: normalizedAccounts,
          }
        : null,
      recommendations,
    },
    warnings: services.filter((service) => !service.ok).map((service) => `${service.name} 健康检查未通过`),
  };
}

function normalizeSellerSummary(raw) {
  if (!raw) return null;
  const compass = raw?.data?.data?.graphBannerBenchData || raw?.data?.graphBannerBenchData || raw?.graphBannerBenchData;
  if (!compass) return null;
  const banner = (compass.bannerDataList || []).map((item) => ({
    name: item.name,
    value: item.dataStr ?? item.data ?? null,
    previous: item.lastDataStr ?? item.lastData ?? null,
    change: item.ratioFormat ?? item.ratio ?? null,
    cycle: item.cycle || "",
  }));
  const graphFields = [
    "ds", "showPv", "showUv", "ipv", "ipvUv", "vstPv", "vstUv", "chatUv",
    "payOrdCnt", "payByrCnt", "payAmt", "rfdOrdCnt", "rfdAmt", "rep3minUvRate",
  ];
  const trend = (compass.graphDataList || []).map((row) =>
    Object.fromEntries(graphFields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]))
  );
  return {
    real_date_range: raw?.data?.extendInfo?.realDateRange || raw?.extendInfo?.realDateRange || [],
    banner,
    latest: trend.length ? trend[trend.length - 1] : null,
    trend,
  };
}

function buildDailyMarkdown(reportDate, overview, today, seller) {
  const lines = [`# 闲鱼经营日报（${reportDate}）`, "", "## 本地运营概览"];
  lines.push(`- 账号：${overview.active_accounts ?? 0}/${overview.total_accounts ?? 0} 个启用`);
  lines.push(`- 累计订单：${overview.total_orders ?? 0}；今日成功回复：${overview.today_reply_count ?? 0}`);
  lines.push(`- 昨日成功回复：${overview.yesterday_reply_count ?? 0}；启用关键词：${overview.total_keywords ?? 0}`);
  if (today) {
    lines.push("", "## 今日订单");
    lines.push(`- 下单：${today.today_orders ?? 0}；已发货：${today.today_shipped ?? 0}；待处理：${today.today_pending ?? 0}`);
    lines.push(`- 有效订单金额：¥${today.today_amount ?? 0}`);
  }
  if (seller?.latest) {
    lines.push("", "## 数据罗盘最新记录");
    lines.push(`- 日期：${seller.latest.ds ?? "-"}`);
    lines.push(`- 曝光 UV：${seller.latest.showUv ?? "-"}；商品浏览 UV：${seller.latest.ipvUv ?? "-"}`);
    lines.push(`- 咨询 UV：${seller.latest.chatUv ?? "-"}；付款订单：${seller.latest.payOrdCnt ?? "-"}`);
    lines.push(`- 付款金额：¥${seller.latest.payAmt ?? "-"}；退款订单：${seller.latest.rfdOrdCnt ?? "-"}`);
  }
  lines.push("", "以上为只读数据汇总，未执行商品、消息或订单写操作。");
  return lines.join("\n");
}

async function dailyReportCommand(args) {
  const period = String(args.period || "recent1d");
  if (!["recent1d", "recent7d", "recent30d"].includes(period)) {
    throw new OpsError("INVALID_ARGUMENT", "period 仅支持 recent1d、recent7d、recent30d");
  }
  const fixture = args.fixture ? readJson(args.fixture) : null;
  const warnings = [];
  let statsRaw;
  let todayRaw = null;
  let sellerRaw = null;
  let sellerErrorCode = null;

  if (fixture) {
    statsRaw = fixture.stats;
    todayRaw = fixture.today || null;
    sellerRaw = fixture.seller || null;
  } else {
    statsRaw = await apiRequest("GET", "/api/v1/cookies/stats");
    const todayResult = await safeCall("今日订单统计", () => apiRequest("GET", "/api/v1/admin/stats/today"));
    if (todayResult.ok) todayRaw = todayResult.data;
    else warnings.push(`${todayResult.error}；日报将省略今日订单明细`);

    if (args["account-id"] !== undefined) {
      const accountId = integerArg(args["account-id"], undefined, { min: 1, max: 2147483647, name: "account-id" });
      const sellerResult = await safeCall("卖家数据罗盘", () =>
        apiRequest("POST", "/api/v1/data-analysis/seller-summary", {
          body: { account_id: accountId, date_type: period, date_range: "" },
          timeoutMs: 90000,
        })
      );
      if (sellerResult.ok) sellerRaw = sellerResult.data;
      else {
        sellerErrorCode = sellerResult.code || null;
        if (sellerErrorCode === "PERMISSION_DENIED") {
          warnings.push("卖家数据罗盘: PERMISSION_DENIED（账号无权限）；请在闲鱼商家后台确认并开通权限；日报将保留本地统计");
        } else {
          warnings.push(`${sellerResult.error}；日报将保留本地统计`);
        }
      }
    }
  }

  const overview = statsRaw?.data || statsRaw;
  if (!overview || typeof overview !== "object") throw new OpsError("INVALID_RESPONSE", "经营统计响应为空或格式不正确");
  const today = todayRaw?.data || todayRaw;
  const seller = normalizeSellerSummary(sellerRaw);
  const reportDate = beijingDate();
  const todayReplies = Number(overview.today_reply_count || 0);
  const yesterdayReplies = Number(overview.yesterday_reply_count || 0);
  const data = {
    report_date: reportDate,
    period,
    overview: {
      total_accounts: Number(overview.total_accounts || 0),
      active_accounts: Number(overview.active_accounts || 0),
      total_orders: Number(overview.total_orders || 0),
      total_keywords: Number(overview.total_keywords || 0),
      today_reply_count: todayReplies,
      yesterday_reply_count: yesterdayReplies,
      reply_delta: todayReplies - yesterdayReplies,
      reply_change_rate: yesterdayReplies > 0 ? round((todayReplies - yesterdayReplies) / yesterdayReplies, 4) : null,
    },
    today: today
      ? {
          today_orders: Number(today.today_orders || 0),
          today_shipped: Number(today.today_shipped || 0),
          today_pending: Number(today.today_pending || 0),
          today_amount: Number(today.today_amount || 0),
          currency: "CNY",
        }
      : null,
    seller_compass: seller,
    data_quality: {
      local_stats: true,
      admin_today: Boolean(today),
      seller_compass: Boolean(seller),
      seller_compass_error_code: sellerErrorCode,
      note: "数据罗盘按所选周期返回；本地订单与回复按北京时间自然日统计",
    },
  };
  data.markdown = buildDailyMarkdown(reportDate, data.overview, data.today, seller);
  return { data, warnings };
}

module.exports = { dailyReportCommand, doctorCommand, normalizeSellerSummary, summarizeDoctor };
