const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../../../");
const DEFAULT_API_BASE = process.env.XIANYU_API_BASE || "http://127.0.0.1:8089";
const TOKEN_FILE = path.join(WORKSPACE_ROOT, "scripts", ".token");
const DEFAULT_AUDIT_FILE = path.join(WORKSPACE_ROOT, ".workbuddy", "audit", "xianyu-listing.jsonl");

class OpsError extends Error {
  constructor(code, message, hint = "", details = undefined) {
    super(message);
    this.name = "OpsError";
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (!key) throw new OpsError("INVALID_ARGUMENT", "存在无效参数");
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function readJson(file) {
  const absolute = path.resolve(String(file || ""));
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new OpsError("INVALID_JSON", `读取上架 JSON 失败: ${absolute}`, error.message);
  }
}

function loadToken() {
  if (process.env.XIANYU_TOKEN) return process.env.XIANYU_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  return "";
}

async function apiRequest(method, apiPath, { body, headers = {}, timeoutMs = 30000 } = {}) {
  const token = loadToken();
  if (!token) {
    throw new OpsError("AUTH_REQUIRED", "缺少后台登录 Token", "先登录本机后台或设置 XIANYU_TOKEN");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${DEFAULT_API_BASE.replace(/\/$/, "")}${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...headers },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new OpsError("TIMEOUT", `请求超时: ${apiPath}`, `超过 ${timeoutMs}ms`);
    }
    throw new OpsError("NETWORK_ERROR", `请求网络失败: ${apiPath}`, error.message);
  } finally {
    clearTimeout(timer);
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    throw new OpsError("NETWORK_ERROR", `读取接口响应失败: ${apiPath}`, error.message);
  }
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new OpsError("INVALID_RESPONSE", `接口未返回 JSON: ${apiPath}`, `HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new OpsError(
      response.status === 401 ? "AUTH_REQUIRED" : "HTTP_ERROR",
      data.message || data.detail || `HTTP ${response.status}`,
      `HTTP ${response.status}`,
      data
    );
  }
  if (data.success === false) {
    throw new OpsError("BUSINESS_ERROR", data.message || "上架接口返回业务失败", "检查接口返回和审计记录", data);
  }
  return data;
}

function successEnvelope(command, data, warnings = [], meta = {}) {
  return {
    ok: true,
    command,
    generated_at: new Date().toISOString(),
    data,
    warnings,
    meta: {
      mode: meta.mode || "live",
      read_only: meta.read_only === true,
      external_writes: meta.external_writes === true,
    },
  };
}

function errorEnvelope(command, error, meta = {}) {
  return {
    ok: false,
    command,
    generated_at: new Date().toISOString(),
    error: {
      code: error.code || "UNEXPECTED_ERROR",
      message: error.message || String(error),
      hint: error.hint || "",
    },
    meta: {
      mode: meta.mode || "live",
      read_only: meta.read_only === true,
      external_writes: meta.external_writes === true,
    },
  };
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  DEFAULT_AUDIT_FILE,
  OpsError,
  WORKSPACE_ROOT,
  apiRequest,
  emit,
  errorEnvelope,
  parseArgs,
  readJson,
  successEnvelope,
};
