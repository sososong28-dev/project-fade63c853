const {
  apiRequest,
  integerArg,
  readJson,
  requireText,
} = require("./core");

const DEFAULT_RULES = {
  aftersale: {
    keywords: ["退款", "退货", "补发", "收不到", "没有收到", "未收到", "不能用", "无法使用", "售后", "纠纷"],
    reply: "我先帮你核对订单和交付记录，确认具体情况后再处理，请稍等。",
    risk_level: "high",
  },
  price: {
    keywords: ["便宜", "优惠", "小刀", "议价", "最低价", "少一点", "降价"],
    reply: "价格需要结合这件商品的情况再确认，我核实后回复你，不会随意改动价格。",
    risk_level: "high",
  },
  delivery: {
    keywords: ["怎么发货", "发货", "卡密", "链接", "多久收到", "怎么交付"],
    reply: "付款成功后会按商品页面说明交付；如果长时间未收到，我可以帮你核查订单记录。",
    risk_level: "low",
  },
  availability: {
    keywords: ["还在吗", "还有吗", "有货吗", "还在", "可以拍吗"],
    reply: "在的，商品目前还在。你想先了解商品情况、价格还是交付方式？",
    risk_level: "low",
  },
  product_detail: {
    keywords: ["成色", "瑕疵", "划痕", "参数", "型号", "功能", "尺寸", "真假"],
    reply: "这个细节需要按商品实际情况确认，我先核实一下，避免给你不准确的信息。",
    risk_level: "medium",
  },
  shipping: {
    keywords: ["包邮", "运费", "哪里发", "快递", "自提"],
    reply: "运费和发货方式需要按商品及地区确认，我先帮你核对后再回复。",
    risk_level: "medium",
  },
  unknown: {
    keywords: [],
    reply: "你的问题我已看到，需要核实商品和订单信息后回复，请稍等。",
    risk_level: "medium",
  },
};

function mergeRules(custom) {
  const rules = { ...DEFAULT_RULES };
  for (const [intent, rule] of Object.entries(custom || {})) {
    if (!DEFAULT_RULES[intent] || !rule || typeof rule !== "object") continue;
    rules[intent] = {
      ...DEFAULT_RULES[intent],
      ...rule,
      keywords: Array.isArray(rule.keywords) ? rule.keywords.map(String) : DEFAULT_RULES[intent].keywords,
    };
  }
  return rules;
}

function classifyMessage(text, rules) {
  for (const intent of ["aftersale", "price", "delivery", "availability", "product_detail", "shipping"]) {
    if (rules[intent].keywords.some((keyword) => keyword && text.includes(keyword))) return intent;
  }
  return "unknown";
}

function extractConversations(raw) {
  return raw?.data?.conversations || raw?.conversations || [];
}

function extractMessages(raw) {
  return raw?.data?.messages || raw?.messages || [];
}

function latestBuyerText(messages, fallback) {
  const buyerMessages = messages.filter((message) => !message.isSelf && message.type !== "card");
  const latest = buyerMessages[buyerMessages.length - 1];
  return String(latest?.text || fallback || "").trim();
}

async function draftRepliesCommand(args) {
  const limit = integerArg(args.limit, 20, { min: 1, max: 50, name: "limit" });
  const rules = mergeRules(args.rules ? readJson(args.rules) : {});
  const fixture = args.fixture ? readJson(args.fixture) : null;
  const accountId = fixture
    ? String(args["account-id"] || fixture.account_id || "fixture-account")
    : requireText(args["account-id"], "闲鱼账号 ID，例如 --account-id 413198903");

  const conversationsRaw = fixture
    ? fixture.conversations
    : await apiRequest("GET", `/api/v1/chat-new/conversations/${encodeURIComponent(accountId)}?limit=50`);
  const conversations = extractConversations(conversationsRaw)
    .filter((conversation) => Number(conversation.unreadCount || conversation.unread_count || 0) > 0)
    .slice(0, limit);
  const warnings = [];
  const drafts = [];

  for (const conversation of conversations) {
    const cid = String(conversation.cid || "");
    if (!cid) continue;
    let messages = [];
    if (fixture) {
      messages = extractMessages(fixture.messages?.[cid]);
    } else {
      try {
        const messagesRaw = await apiRequest(
          "GET",
          `/api/v1/chat-new/messages/${encodeURIComponent(accountId)}/${encodeURIComponent(cid)}?limit=20`
        );
        messages = extractMessages(messagesRaw);
      } catch (error) {
        warnings.push(`会话 ${cid} 读取聊天记录失败，已使用会话摘要: ${error.message}`);
      }
    }
    const text = latestBuyerText(messages, conversation.lastMessageSummary || conversation.last_message);
    if (!text) {
      warnings.push(`会话 ${cid} 没有可识别的买家文本，未生成回复`);
      continue;
    }
    const intent = classifyMessage(text, rules);
    const rule = rules[intent];
    const itemTitle = String(conversation.itemTitle || conversation.item_title || "");
    drafts.push({
      account_id: accountId,
      conversation_id: cid,
      item_title: itemTitle,
      unread_count: Number(conversation.unreadCount || conversation.unread_count || 0),
      buyer_message: text,
      intent,
      confidence: intent === "unknown" ? "low" : "high",
      risk_level: rule.risk_level,
      suggested_reply: String(rule.reply).replaceAll("{itemTitle}", itemTitle || "这件商品"),
      requires_human: true,
      auto_send_allowed: false,
    });
  }

  const data = {
    account_id: accountId,
    summary: {
      unread_conversations: conversations.length,
      drafted: drafts.length,
      high_risk: drafts.filter((draft) => draft.risk_level === "high").length,
      low_confidence: drafts.filter((draft) => draft.confidence === "low").length,
    },
    drafts,
    send_status: "not_sent",
    next_action: "请逐条核对买家问题、商品事实和价格底线；此命令不会发送任何消息",
  };
  return { data, warnings };
}

module.exports = { classifyMessage, DEFAULT_RULES, draftRepliesCommand, mergeRules };
