const { OpsError, numericValue, readJson, requireText, round } = require("./core");

const ABSOLUTE_CLAIMS = /全网最低|史上最强|最强|唯一|百分百|100%|永久有效|绝对|包过|稳赚|无风险/;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n|\\n/g, "\n")
    .trim();
}

function textList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function truncate(text, maxLength) {
  const chars = Array.from(text);
  return chars.length <= maxLength ? text : chars.slice(0, maxLength).join("");
}

function generateListing(input) {
  const productName = requireText(input.product_name || input.name, "商品名称 product_name");
  const kind = input.kind === "virtual" ? "virtual" : "physical";
  const price = numericValue(input.price);
  if (price === null || price <= 0) throw new OpsError("INVALID_ARGUMENT", "price 必须是大于 0 的数字");
  const sellingPoints = textList(input.selling_points);
  if (!sellingPoints.length) throw new OpsError("INVALID_ARGUMENT", "至少提供一个 selling_points 卖点");
  const deliveryMethod = requireText(input.delivery_method, "交付方式 delivery_method");
  const audience = cleanText(input.audience || input.target_user);
  const condition = cleanText(input.condition);
  const deliveryNotes = cleanText(input.delivery_notes);
  const notes = textList(input.notes);
  const images = Array.isArray(input.images) ? input.images.map(cleanText).filter(Boolean) : [];
  const warnings = [];
  const policyFlags = [];

  const deliveryTag = /自动|卡密|网盘|链接/.test(deliveryMethod) ? deliveryMethod : "发货方式见说明";
  const title = truncate(cleanText(input.title_hint) || [productName, sellingPoints[0], deliveryTag].join("｜"), 30);
  const combinedText = [title, productName, ...sellingPoints, deliveryMethod, deliveryNotes, ...notes].join("\n");
  if (ABSOLUTE_CLAIMS.test(combinedText)) {
    policyFlags.push("检测到绝对化或保证性表述，请改为可验证的事实描述");
  }
  if (/版权|破解|盗版|搬运|内部渠道|绕过|规避/.test(combinedText)) {
    policyFlags.push("检测到版权、授权或平台规则相关表述，请确认内容来源和使用权限");
  }
  if (!images.length) warnings.push("尚未提供图片；正式发布前应补充真实、清晰且无联系方式或二维码的素材");
  if (kind === "virtual" && !/授权|来源|版权/.test(combinedText)) {
    warnings.push("虚拟商品建议补充素材来源、授权范围和使用边界");
  }

  const sections = [];
  sections.push("【你可能正需要】");
  sections.push(
    audience
      ? `如果你是需要${productName}的${audience}，可以先看看下面的具体内容和交付方式。`
      : `如果你正在找${productName}，可以先看看下面的具体情况和交付方式。`
  );
  sections.push(kind === "virtual" ? "【我整理了什么】" : "【商品情况】");
  sections.push(sellingPoints.map((point) => `- ${point}`).join("\n"));
  if (condition) sections.push(`【成色/状态】\n${condition}`);
  sections.push("【怎么交付】");
  sections.push(deliveryNotes ? `${deliveryMethod}\n${deliveryNotes}` : deliveryMethod);
  const finalNotes = notes.slice();
  if (kind === "virtual") finalNotes.push("请确认素材来源与授权范围，不要传播未经授权的内容");
  finalNotes.push("商品信息以页面描述和双方确认内容为准，有疑问请先沟通");
  sections.push(`【小提示】\n${finalNotes.map((note) => `- ${note}`).join("\n")}`);
  const description = sections.join("\n\n");

  const data = {
    status: "draft",
    requires_confirmation: true,
    kind,
    title,
    title_length: Array.from(title).length,
    description,
    suggested_price: round(price),
    category_hint: cleanText(input.category),
    images,
    validation: {
      passed: policyFlags.length === 0,
      policy_flags: policyFlags,
      real_newlines: description.includes("\n") && !description.includes("\\n"),
    },
    next_action: "请核对商品事实、价格、素材授权和交付说明；此命令不会发布商品",
  };
  return { data, warnings };
}

async function draftListingCommand(args) {
  const inputFile = requireText(args.input, "输入文件，例如 --input examples/listing-input.json");
  return generateListing(readJson(inputFile));
}

module.exports = { cleanText, draftListingCommand, generateListing, textList };
