const fs = require("fs");
const path = require("path");

const SKILL_ROOT = path.resolve(__dirname, "..", "..");
const WORKSPACE_ROOT = path.resolve(SKILL_ROOT, "..", "..", "..");
const TOKEN_FILE = path.join(WORKSPACE_ROOT, "scripts", ".token");

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

loadDotEnv(path.join(WORKSPACE_ROOT, ".env"));
const DEFAULT_API_BASE = process.env.XIANYU_API_BASE || "http://127.0.0.1:8089";

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
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const equalIndex = token.indexOf("=");
    if (equalIndex > 2) {
      result[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function requireText(value, label) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new OpsError("INVALID_ARGUMENT", `缺少${label}`);
  return text;
}

function integerArg(value, fallback, { min = 1, max = 100, name = "参数" } = {}) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new OpsError("INVALID_ARGUMENT", `${name}必须是 ${min} 到 ${max} 之间的整数`);
  }
  return number;
}

function readJson(file) {
  const absolute = path.resolve(String(file));
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new OpsError("INVALID_JSON", `读取 JSON 失败: ${absolute}`, error.message);
  }
}

function loadToken() {
  if (process.env.XIANYU_TOKEN) return process.env.XIANYU_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  return "";
}

function parseResponseText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new OpsError("TIMEOUT", `请求超时: ${url}`, `超过 ${timeoutMs}ms`);
    }
    throw new OpsError("NETWORK_ERROR", `无法连接: ${url}`, error.message);
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequest(method, apiPath, { body, auth = true, timeoutMs = 30000 } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = loadToken();
    if (!token) {
      throw new OpsError(
        "AUTH_REQUIRED",
        "缺少后台登录 Token",
        "先运行 node scripts/api-client.js login，或设置 XIANYU_TOKEN"
      );
    }
    headers.Authorization = `Bearer ${token}`;
  }
  const url = `${DEFAULT_API_BASE.replace(/\/$/, "")}${apiPath}`;
  const response = await fetchWithTimeout(
    url,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    timeoutMs
  );
  const text = await response.text();
  const data = parseResponseText(text);
  if (!response.ok) {
    const message = data && (data.message || data.detail) ? data.message || data.detail : `HTTP ${response.status}`;
    const authFailed = response.status === 401 || message === "Could not validate credentials";
    throw new OpsError(
      authFailed ? "AUTH_REQUIRED" : "HTTP_ERROR",
      `${method} ${apiPath}: ${message}`,
      authFailed ? "后台 Token 无效或已过期，请人工重新登录并更新 Token" : `HTTP ${response.status}`
    );
  }
  if (data && data.success === false) {
    const message = data.message || `${apiPath} 返回业务失败`;
    const authFailed = message === "Could not validate credentials";
    const permissionDenied =
      data.error_code === "PERMISSION_DENIED" ||
      message.includes("PERMISSION_DENIED") ||
      message.includes("FAIL_BIZ_IDLE_USER_UNAUTHORIZED");
    throw new OpsError(
      authFailed ? "AUTH_REQUIRED" : permissionDenied ? "PERMISSION_DENIED" : "BUSINESS_ERROR",
      message,
      authFailed
        ? "后台 Token 无效或已过期，请人工重新登录并更新 Token"
        : permissionDenied
          ? "请在闲鱼商家后台确认并开通卖家数据罗盘权限"
          : "HTTP 200 不代表业务成功"
    );
  }
  return data;
}

async function healthRequest(url, timeoutMs = 4000) {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, timeoutMs);
    const text = await response.text();
    return { ok: response.ok, status: response.status, latency_ms: Date.now() - started };
  } catch (error) {
    return { ok: false, latency_ms: Date.now() - started, error: error.message };
  }
}

async function safeCall(label, fn) {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return {
      ok: false,
      code: error.code || "UNEXPECTED_ERROR",
      error: `${label}: ${error.message}`,
      hint: error.hint || "",
    };
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/,/g, "").trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  let number = Number(match[0]);
  if (text.includes("亿")) number *= 100000000;
  else if (text.includes("万")) number *= 10000;
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function beijingDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function successEnvelope(command, mode, result) {
  return {
    ok: true,
    command,
    generated_at: new Date().toISOString(),
    data: result.data,
    warnings: result.warnings || [],
    meta: { mode, read_only: true, external_writes: false },
  };
}

function errorEnvelope(command, mode, error) {
  return {
    ok: false,
    command,
    generated_at: new Date().toISOString(),
    error: {
      code: error.code || "UNEXPECTED_ERROR",
      message: error.message || String(error),
      hint: error.hint || "",
    },
    meta: { mode, read_only: true, external_writes: false },
  };
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  DEFAULT_API_BASE,
  OpsError,
  apiRequest,
  asArray,
  beijingDate,
  emit,
  errorEnvelope,
  healthRequest,
  integerArg,
  loadToken,
  median,
  numericValue,
  parseArgs,
  readJson,
  requireText,
  round,
  safeCall,
  successEnvelope,
};
