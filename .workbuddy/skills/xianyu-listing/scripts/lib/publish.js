const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_AUDIT_FILE,
  OpsError,
  WORKSPACE_ROOT,
  apiRequest,
  readJson,
} = require("./core");

const ALLOWED_FIELDS = new Set([
  "account_id", "title", "description", "price", "original_price", "category",
  "images", "address", "delivery_method", "postage", "brand", "condition",
  // 平台分类 ID 字段（发布必需，缺省时由分类推荐接口自动补全）
  "platform_category_id", "platform_category_name",
  "platform_channel_category_id", "platform_channel_category_name",
  "platform_tb_category_id",
]);
const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function text(value, name, maxLength = 0) {
  const result = String(value ?? "").trim();
  if (!result) throw new OpsError("INVALID_ARGUMENT", `缺少 ${name}`);
  if (maxLength && result.length > maxLength) {
    throw new OpsError("INVALID_ARGUMENT", `${name} 最长 ${maxLength} 字符`);
  }
  return result;
}

function number(value, name, { required = true, fallback = undefined } = {}) {
  const result = value === undefined && fallback !== undefined ? fallback : Number(value);
  if (value === undefined && !required) return undefined;
  if (!Number.isFinite(result) || result <= 0) {
    throw new OpsError("INVALID_ARGUMENT", `${name} 必须是大于 0 的数字`);
  }
  return result;
}

function normalizeImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 9) {
    throw new OpsError("INVALID_ARGUMENT", "images 必须包含 1 到 9 张本地图片");
  }
  return images.map((value, index) => {
    const absolute = path.isAbsolute(String(value))
      ? String(value)
      : path.resolve(WORKSPACE_ROOT, String(value));
    const extension = path.extname(absolute).toLowerCase();
    if (!IMAGE_TYPES[extension]) {
      throw new OpsError("INVALID_ARGUMENT", `第 ${index + 1} 张图片仅支持 png/jpg/jpeg/webp`);
    }
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      throw new OpsError("IMAGE_NOT_FOUND", `图片不存在: ${absolute}`);
    }
    if (!stat.isFile() || stat.size < 1 || stat.size > 5 * 1024 * 1024) {
      throw new OpsError("INVALID_IMAGE", `图片必须是非空文件且不超过 5MB: ${absolute}`);
    }
    const content = fs.readFileSync(absolute);
    return {
      path: absolute,
      name: path.basename(absolute),
      mime: IMAGE_TYPES[extension],
      size: stat.size,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
    };
  });
}

function normalizeListing(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new OpsError("INVALID_ARGUMENT", "上架输入必须是 JSON 对象");
  }
  const unknown = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length) {
    throw new OpsError(
      "UNSUPPORTED_FIELD",
      `包含不允许的字段: ${unknown.join(", ")}`,
      "此 Skill 只执行上架，不支持卡券、关键词、自动发货或其他写操作"
    );
  }
  const deliveryMethod = String(input.delivery_method || "express");
  if (!["express", "pickup"].includes(deliveryMethod)) {
    throw new OpsError("INVALID_ARGUMENT", "delivery_method 仅支持 express/pickup");
  }
  const postage = input.postage === undefined ? 0 : Number(input.postage);
  if (!Number.isFinite(postage) || postage < 0) {
    throw new OpsError("INVALID_ARGUMENT", "postage 必须是大于或等于 0 的数字");
  }
  const payload = {
    account_id: text(input.account_id, "account_id"),
    title: text(input.title, "title", 200),
    description: text(input.description, "description"),
    price: number(input.price, "price"),
    category: text(input.category, "category"),
    address: text(input.address, "address"),
    delivery_method: deliveryMethod,
    postage,
    condition: text(input.condition || "全新", "condition"),
  };
  const originalPrice = number(input.original_price, "original_price", { required: false });
  if (originalPrice !== undefined) payload.original_price = originalPrice;
  if (input.brand !== undefined && String(input.brand).trim()) payload.brand = String(input.brand).trim();
  // 平台分类 ID 字段（可选，缺省时发布前由分类推荐接口补全）
  for (const key of [
    "platform_category_id", "platform_category_name",
    "platform_channel_category_id", "platform_channel_category_name",
    "platform_tb_category_id",
  ]) {
    if (input[key] !== undefined && String(input[key]).trim()) {
      payload[key] = String(input[key]).trim();
    }
  }
  const images = normalizeImages(input.images);
  const reviewId = crypto.createHash("sha256")
    .update(JSON.stringify({
      listing: payload,
      images: images.map((image) => ({ sha256: image.sha256, size: image.size })),
    }))
    .digest("hex");
  return { payload, images, reviewId };
}

function auditPath() {
  const configured = process.env.XIANYU_LISTING_AUDIT_FILE || DEFAULT_AUDIT_FILE;
  return path.isAbsolute(configured) ? configured : path.resolve(WORKSPACE_ROOT, configured);
}

function readAudit(file, reviewId) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new OpsError("AUDIT_ERROR", `审计文件第 ${index + 1} 行损坏，已停止上架`, file);
    }
  }).filter((record) => record.review_id === reviewId);
}

function appendAudit(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ timestamp: new Date().toISOString(), ...record })}\n`, "utf8");
}

function previousResult(file, reviewId) {
  const records = readAudit(file, reviewId);
  const latest = records[records.length - 1];
  if (!latest) return null;
  if (latest.status === "success") return latest.result || {};
  if (["pending", "uncertain"].includes(latest.status)) {
    throw new OpsError(
      "PUBLISH_RECONCILIATION_REQUIRED",
      "同一商品存在未完成或结果不确定的上架记录，已禁止重复执行",
      `请先在闲鱼后台人工核查商品是否已上架，再处理审计文件: ${file}`
    );
  }
  return null;
}

function acquireLock(file, reviewId) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lockFile = `${file}.${reviewId}.lock`;
  try {
    const handle = fs.openSync(lockFile, "wx");
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
    fs.closeSync(handle);
    return lockFile;
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new OpsError("PUBLISH_IN_PROGRESS", "同一商品正在执行或上次异常退出，已禁止并发上架", lockFile);
    }
    throw error;
  }
}

async function uploadImages(images, reviewId) {
  const form = new FormData();
  for (const image of images) {
    form.append("files", new Blob([fs.readFileSync(image.path)], { type: image.mime }), image.name);
  }
  const result = await apiRequest("POST", "/api/v1/product-publish/upload/images", {
    body: form,
    headers: { "Idempotency-Key": `${reviewId}:images` },
    timeoutMs: 120000,
  });
  const paths = result.data?.paths;
  if (!Array.isArray(paths) || paths.length !== images.length || paths.some((value) => !value)) {
    throw new OpsError("INVALID_RESPONSE", "图片上传接口返回的路径数量不正确", "未执行商品发布");
  }
  return paths;
}

function hasCategoryIds(payload) {
  return Boolean(
    payload.platform_channel_category_id &&
    payload.platform_category_id
  );
}

async function resolveCategory(payload) {
  // 若已提供平台分类 ID，直接返回，不额外调用推荐接口
  if (hasCategoryIds(payload)) {
    return payload;
  }
  const result = await apiRequest("POST", "/api/v1/product-publish/category/recommend", {
    body: JSON.stringify({
      account_id: payload.account_id,
      title: payload.title,
      description: payload.description,
    }),
    headers: { "Content-Type": "application/json" },
    timeoutMs: 30000,
  });
  const candidates = result.data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new OpsError(
      "CATEGORY_RESOLVE_FAILED",
      "分类推荐接口未返回可用分类",
      "请人工在闲鱼后台确认商品分类，或在上架 JSON 中显式提供 platform_category_id / platform_channel_category_id / platform_tb_category_id"
    );
  }
  // 优先取 is_selected 或 score 最高的候选
  const selected = candidates.find((candidate) => candidate?.is_selected) || candidates[0];
  const next = { ...payload };
  if (selected.cat_id) next.platform_category_id = String(selected.cat_id);
  if (selected.cat_name) next.platform_category_name = String(selected.cat_name);
  if (selected.channel_cat_id) next.platform_channel_category_id = String(selected.channel_cat_id);
  if (selected.channel_cat_name) next.platform_channel_category_name = String(selected.channel_cat_name);
  if (selected.tb_cat_id) next.platform_tb_category_id = String(selected.tb_cat_id);
  if (!hasCategoryIds(next)) {
    throw new OpsError(
      "CATEGORY_RESOLVE_FAILED",
      "分类推荐接口返回的分类缺少平台分类 ID",
      "请人工在闲鱼后台确认商品分类，或显式提供平台分类 ID 字段"
    );
  }
  return next;
}

async function publishCommand(args) {
  if (!args.input || args.input === true) throw new OpsError("INVALID_ARGUMENT", "缺少 --input <json>");
  const normalized = normalizeListing(readJson(args.input));
  const { payload, images, reviewId } = normalized;
  const preview = {
    listing: payload,
    images: images.map((image) => ({
      path: image.path,
      size: image.size,
      sha256: image.sha256,
    })),
  };

  if (!args.confirm) {
    return {
      data: {
        status: "awaiting_confirmation",
        review_id: reviewId,
        review: preview,
        confirmation_rule: "人工核对商品文字、价格、账号、分类、地址和全部图片后，使用 --confirm <review_id> 执行",
      },
      warnings: ["当前仅预览，未上传图片、未发布商品，也未执行 doctor"],
      meta: { mode: "preview", read_only: true, external_writes: false },
    };
  }
  if (args.confirm === true || String(args.confirm) !== reviewId) {
    throw new OpsError(
      "CONFIRMATION_MISMATCH",
      "确认码与当前商品内容或图片不一致，未执行任何写操作",
      `重新人工巡检并使用最新 review_id: ${reviewId}`
    );
  }

  const auditFile = auditPath();
  const lockFile = acquireLock(auditFile, reviewId);
  let stage = "audit";
  let mayHaveCompleted = false;
  try {
    const previous = previousResult(auditFile, reviewId);
    if (previous) {
      return {
        data: { status: "published", ...previous, review_id: reviewId, duplicate_prevented: true },
        warnings: ["检测到相同内容已成功上架，本次未调用任何外部接口"],
        meta: { mode: "live", read_only: false, external_writes: false },
      };
    }

    appendAudit(auditFile, {
      review_id: reviewId,
      status: "pending",
      stage: "upload",
      account_id: payload.account_id,
      title: payload.title,
    });
    stage = "upload";
    const uploadedPaths = await uploadImages(images, reviewId);

    stage = "category";
    const publishPayload = await resolveCategory(payload);

    stage = "publish";
    const result = await apiRequest("POST", "/api/v1/product-publish/publish/single", {
      body: JSON.stringify({ ...publishPayload, images: uploadedPaths }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": reviewId },
      timeoutMs: 240000,
    });
    mayHaveCompleted = true;
    const resultData = result.data || {};
    if (!resultData.item_id) {
      throw new OpsError("PUBLISH_UNCERTAIN", "发布接口未返回 item_id，不能安全重试", "先在闲鱼后台人工核查");
    }
    const published = {
      account_id: payload.account_id,
      title: payload.title,
      item_id: String(resultData.item_id),
      item_url: resultData.item_url || null,
      log_id: resultData.log_id || null,
    };
    appendAudit(auditFile, {
      review_id: reviewId,
      status: "success",
      stage: "completed",
      account_id: payload.account_id,
      title: payload.title,
      result: published,
    });
    return {
      data: {
        status: "published",
        ...published,
        review_id: reviewId,
        duplicate_prevented: false,
        audit_file: auditFile,
      },
      warnings: [],
      meta: { mode: "live", read_only: false, external_writes: true },
    };
  } catch (error) {
    const uncertain = mayHaveCompleted || (
      stage === "publish" && ["NETWORK_ERROR", "TIMEOUT", "HTTP_ERROR", "INVALID_RESPONSE", "PUBLISH_UNCERTAIN"].includes(error.code)
    );
    if (["upload", "publish"].includes(stage)) error.externalWrites = true;
    if (error.code === "PUBLISH_RECONCILIATION_REQUIRED") throw error;
    try {
      appendAudit(auditFile, {
        review_id: reviewId,
        status: uncertain ? "uncertain" : "failed",
        stage,
        account_id: payload.account_id,
        title: payload.title,
        error_code: error.code || "UNEXPECTED_ERROR",
        error_message: error.message || String(error),
      });
    } catch {
      // 原 pending 记录仍会阻止未核查的重复上架。
    }
    if (uncertain && error.code !== "PUBLISH_UNCERTAIN") {
      const wrapped = new OpsError(
        "PUBLISH_UNCERTAIN",
        "上架结果不确定，已禁止自动重试",
        `请先在闲鱼后台人工核查；审计文件: ${auditFile}`
      );
      wrapped.externalWrites = true;
      throw wrapped;
    }
    throw error;
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* 保留锁比允许重复上架更安全 */ }
  }
}

module.exports = { normalizeListing, publishCommand };
