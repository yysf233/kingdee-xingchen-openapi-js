const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPascalCase(input) {
  return String(input || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function stableStringify(v) {
  return JSON.stringify(v, null, 2);
}

function scoreEndpoint(ep, op) {
  const title = String(ep.title || "").toLowerCase();
  const pathOrUrl = String(ep.pathOrUrl || "").toLowerCase();
  const method = String(ep.method || "").toUpperCase();
  const lenScore = 1000 - Math.min(pathOrUrl.length, 1000);
  let keywordScore = 0;

  const opPreferred = {
    "read:list": ["列表", "查询", "检索", "list", "query", "search"],
    "read:detail": ["详情", "明细", "detail", "get"],
    "write:upsert": ["保存", "save"],
    "write:create": ["新增", "创建", "create", "add"],
    "write:update": ["修改", "更新", "update", "edit"],
    "write:delete": ["删除", "delete", "remove"],
    "workflow:submit": ["提交", "submit"],
    "workflow:audit": ["审核", "audit", "approve"],
    "workflow:unaudit": ["反审核", "unaudit", "unapprove"],
    "workflow:cancel": ["取消", "作废", "cancel", "void"],
    "workflow:close": ["关闭", "close"],
    "workflow:open": ["反关闭", "open", "reopen"],
    "workflow:enable": ["启用", "enable"],
    "workflow:disable": ["禁用", "disable"],
  };
  const keywords = opPreferred[op] || [];
  for (const k of keywords) {
    if (title.includes(String(k).toLowerCase())) keywordScore += 30;
    if (pathOrUrl.includes(String(k).toLowerCase())) keywordScore += 8;
  }

  let methodScore = 0;
  if (op.startsWith("read:") && method === "GET") methodScore += 20;
  if ((op.startsWith("write:") || op.startsWith("workflow:")) && method === "POST") methodScore += 15;

  return lenScore + keywordScore + methodScore;
}

function choosePrimaryEndpoint(endpoints, op) {
  const candidates = endpoints.filter((ep) => ep.tags?.op === op);
  if (candidates.length === 0) return { primary: null, candidates: [] };

  const scored = candidates
    .map((ep) => ({ ep, score: scoreEndpoint(ep, op) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ap = String(a.ep.pathOrUrl || "");
      const bp = String(b.ep.pathOrUrl || "");
      if (ap.length !== bp.length) return ap.length - bp.length;
      return String(a.ep.title || "").localeCompare(String(b.ep.title || ""));
    });

  return {
    primary: scored[0].ep,
    candidates: scored.map((v) => v.ep),
  };
}

function buildCoreUrlModule() {
  return `const { URL } = require("url");

function normalizeHost(host) {
  const h = String(host || process.env.OPENAPI_HOST || "https://api.kingdee.com").trim();
  if (!h) return "https://api.kingdee.com";
  return h.replace(/\\/+$/, "");
}

function isAbsoluteUrl(url) {
  return /^https?:\\/\\//i.test(String(url || ""));
}

function buildUrl({ openapiHost, endpointUrl, overrideHost = false }) {
  if (!endpointUrl) throw new Error("endpointUrl is required");
  const raw = String(endpointUrl).trim();
  const baseHost = normalizeHost(openapiHost);

  if (isAbsoluteUrl(raw)) {
    if (!overrideHost) return raw;
    const from = new URL(raw);
    const to = new URL(baseHost);
    from.protocol = to.protocol;
    from.host = to.host;
    return from.toString();
  }

  const p = raw.startsWith("/") ? raw : \`/\${raw}\`;
  return \`\${baseHost}\${p}\`;
}

module.exports = { buildUrl, isAbsoluteUrl, normalizeHost };
`;
}

function buildCoreAssertModule() {
  return `function requireEnv(keys) {
  const missing = (keys || []).filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(\`Missing env: \${missing.join(", ")}\`);
  }
}

function redactSecrets(input) {
  const text = String(input ?? "");
  return text
    .replace(/(client_secret|app_secret|token|signature|secret)(\\\\?["']?\\\\s*[:=]\\\\s*\\\\?["']?)([^"\\\\s&]+)/gi, "$1$2***")
    .replace(/(app-token=)[^&\\\\s]+/gi, "$1***")
    .replace(/(access_token=)[^&\\\\s]+/gi, "$1***");
}

function safeLog(prefix, payload) {
  const p = prefix ? String(prefix) : "[LOG]";
  if (payload === undefined) {
    console.log(p);
    return;
  }
  try {
    console.log(\`\${p} \${redactSecrets(JSON.stringify(payload))}\`);
  } catch {
    console.log(\`\${p} \${redactSecrets(String(payload))}\`);
  }
}

module.exports = { requireEnv, redactSecrets, safeLog };
`;
}

function buildCoreHeadersModule() {
  return `const { randomUUID } = require("crypto");

const IDEMPOTENCY_HINT_KEYS = [
  "number",
  "no",
  "code",
  "billno",
  "externalno",
  "extno",
  "thirdno",
  "编码",
  "单号",
];

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function hasHeader(headers, name) {
  const lower = String(name || "").toLowerCase();
  return Object.keys(headers || {}).some((k) => String(k).toLowerCase() === lower);
}

function findValueByHints(input) {
  const queue = [input];
  const seen = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current) && !Array.isArray(current)) continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [k, v] of Object.entries(current)) {
      const key = String(k).toLowerCase();
      if (IDEMPOTENCY_HINT_KEYS.includes(key) && v !== undefined && v !== null && String(v) !== "") {
        return String(v);
      }
      if (isObject(v) || Array.isArray(v)) queue.push(v);
    }
  }
  return null;
}

function makeUuid(uuidFn) {
  if (typeof uuidFn === "function") return String(uuidFn());
  if (typeof randomUUID === "function") return randomUUID();
  return \`\${Date.now()}-\${Math.random().toString(16).slice(2)}\`;
}

function resolveIdempotencyKey({ idempotencyKey, payload, uuidFn } = {}) {
  if (idempotencyKey !== undefined && idempotencyKey !== null && String(idempotencyKey) !== "") {
    return String(idempotencyKey);
  }
  const fromPayload = findValueByHints(payload);
  if (fromPayload) return fromPayload;
  return makeUuid(uuidFn);
}

function buildHeaders({
  defaultHeaders = {},
  extraHeaders = {},
  isWrite = false,
  isBodyMethod = false,
  idempotencyKey,
  idempotencyTimeoutSec,
  payload,
  enableIdempotency = true,
  uuidFn,
} = {}) {
  const headers = Object.assign({}, defaultHeaders || {}, extraHeaders || {});
  if (!isWrite) return headers;

  if (isBodyMethod && !hasHeader(headers, "Content-Type")) {
    headers["Content-Type"] = "application/json";
  }

  if (enableIdempotency !== false) {
    headers["Idempotency-Key"] = resolveIdempotencyKey({
      idempotencyKey,
      payload,
      uuidFn,
    });
  }

  if (idempotencyTimeoutSec !== undefined && idempotencyTimeoutSec !== null && idempotencyTimeoutSec !== "") {
    const n = Number(idempotencyTimeoutSec);
    if (Number.isFinite(n) && n > 0) {
      headers["Idempotency-Timeout"] = String(Math.floor(n));
    }
  }

  return headers;
}

function maskValue(key, value) {
  const lower = String(key || "").toLowerCase();
  const text = String(value ?? "");
  if (lower === "idempotency-key") {
    if (!text) return "***";
    return text.slice(0, 6) + "***";
  }
  if (
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("signature") ||
    lower.includes("authorization")
  ) {
    return "***";
  }
  return value;
}

function maskSensitiveHeadersForLog(headers) {
  const out = {};
  const input = headers || {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = maskValue(k, v);
  }
  return out;
}

module.exports = {
  buildHeaders,
  maskSensitiveHeadersForLog,
  resolveIdempotencyKey,
};
`;
}

function buildCoreRetryModule() {
  return `const NON_RETRY_CODES = new Set([400, 401, 403, 404, 405, 415, 601, 603, 604]);
const NETWORK_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ENOTFOUND"]);

function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\\d+$/.test(v)) return Number(v);
  return null;
}

function collectCodes(err) {
  const values = [
    err?.status,
    err?.statusCode,
    err?.code,
    err?.errorCode,
    err?.errcode,
    err?.response?.status,
    err?.response?.data?.errcode,
    err?.data?.errcode,
  ];
  return values.map(toNumber).filter((v) => v !== null);
}

function hasCode(err, code) {
  return collectCodes(err).includes(code);
}

function isRateLimited(err) {
  const msg = String(err?.message || "");
  return hasCode(err, 429) || msg.includes("429") || msg.includes("限流");
}

function isMediaTypeUnsupported(err) {
  const msg = String(err?.message || "");
  return hasCode(err, 415) || msg.includes("415");
}

function isServerError(err) {
  return collectCodes(err).some((v) => v >= 500 && v <= 599);
}

function isNetworkOrTimeout(err) {
  const name = String(err?.name || "");
  const code = String(err?.code || "").toUpperCase();
  if (/timeout/i.test(name)) return true;
  if (NETWORK_CODES.has(code)) return true;
  return false;
}

function shouldRetry(err, attempt, maxRetries = 3) {
  if (attempt >= maxRetries) return false;
  if (isMediaTypeUnsupported(err)) return false;

  const codes = collectCodes(err);
  if (codes.some((v) => NON_RETRY_CODES.has(v) && v !== 429)) return false;

  if (isRateLimited(err)) return true;
  if (isNetworkOrTimeout(err)) return true;
  if (isServerError(err)) return true;
  return false;
}

function backoffDelayMs(attempt, baseDelayMs = 500, jitterFn = Math.random) {
  const base = Number.isFinite(Number(baseDelayMs)) ? Math.max(0, Number(baseDelayMs)) : 500;
  const jitter = Math.floor((typeof jitterFn === "function" ? jitterFn() : Math.random()) * 101);
  return Math.floor(base * Math.pow(2, Math.max(0, attempt))) + jitter;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { maxRetries = 3, baseDelayMs = 500, logger, sleep = defaultSleep, jitterFn } = {}) {
  if (typeof fn !== "function") throw new Error("withRetry requires a function");
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!shouldRetry(err, attempt, maxRetries)) throw err;
      const delayMs = backoffDelayMs(attempt, baseDelayMs, jitterFn);
      if (typeof logger === "function") {
        logger({
          event: "retry",
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          message: err?.message || String(err),
        });
      }
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

module.exports = {
  shouldRetry,
  backoffDelayMs,
  withRetry,
};
`;
}

function buildEndpointConst(opName, ep) {
  return `${opName}: ${stableStringify({
    op: ep.tags.op,
    title: ep.title,
    method: ep.method || null,
    pathOrUrl: ep.pathOrUrl || null,
    isRelative: !!ep.isRelative,
    docPath: ep.docPath || null,
  })}`;
}

function escapeBlockComment(text) {
  return String(text || "").replace(/\*\//g, "* /");
}

function buildResourceModule(objectKey, endpoints) {
  const apiName = `create${toPascalCase(objectKey)}Api`;
  const opList = [
    "read:list",
    "read:detail",
    "write:upsert",
    "write:create",
    "write:update",
    "write:delete",
    "workflow:submit",
    "workflow:audit",
    "workflow:unaudit",
    "workflow:cancel",
    "workflow:close",
    "workflow:open",
    "workflow:enable",
    "workflow:disable",
  ];

  const picked = {};
  const candidateComments = [];
  for (const op of opList) {
    const { primary, candidates } = choosePrimaryEndpoint(endpoints, op);
    if (!primary) continue;
    picked[op] = primary;
    if (candidates.length > 1) {
      const texts = candidates
        .slice(1)
        .map((c) => `${c.title} [${c.method || "POST"} ${c.pathOrUrl || ""}]`)
        .join("; ");
      candidateComments.push(`${op}: ${texts}`);
    }
  }

  const endpointEntries = [];
  const endpointMethodMap = {};
  if (picked["read:list"]) {
    endpointEntries.push(buildEndpointConst("list", picked["read:list"]));
    endpointMethodMap.list = "read:list";
  }
  if (picked["read:detail"]) {
    endpointEntries.push(buildEndpointConst("detail", picked["read:detail"]));
    endpointMethodMap.detail = "read:detail";
  }
  if (picked["write:upsert"]) {
    endpointEntries.push(buildEndpointConst("save", picked["write:upsert"]));
    endpointMethodMap.save = "write:upsert";
  }
  if (picked["write:create"]) {
    endpointEntries.push(buildEndpointConst("create", picked["write:create"]));
    endpointMethodMap.create = "write:create";
  }
  if (picked["write:update"]) {
    endpointEntries.push(buildEndpointConst("update", picked["write:update"]));
    endpointMethodMap.update = "write:update";
  }
  if (picked["write:delete"]) {
    endpointEntries.push(buildEndpointConst("delete", picked["write:delete"]));
    endpointMethodMap.delete = "write:delete";
  }

  const workflowNames = [
    "submit",
    "audit",
    "unaudit",
    "cancel",
    "close",
    "open",
    "enable",
    "disable",
  ];
  for (const name of workflowNames) {
    const op = `workflow:${name}`;
    if (picked[op]) {
      endpointEntries.push(buildEndpointConst(name, picked[op]));
      endpointMethodMap[name] = op;
    }
  }

  const candidateBlock = candidateComments.length
    ? `/*\nCandidate endpoints (not selected):\n${escapeBlockComment(candidateComments.join("\n"))}\n*/\n`
    : "";

  const availableMethodNames = Object.keys(endpointMethodMap);
  const hasList = availableMethodNames.includes("list");
  const hasDetail = availableMethodNames.includes("detail");

  return `const { buildUrl } = require("../core/url.cjs");
const { safeLog } = require("../core/assert.cjs");
const { buildHeaders, maskSensitiveHeadersForLog } = require("../core/headers.cjs");
const { withRetry } = require("../core/retry.cjs");

${candidateBlock}const ENDPOINTS = {
${endpointEntries.map((e) => `  ${e}`).join(",\n")}
};

function hasEndpoint(name) {
  return !!ENDPOINTS[name] && !!ENDPOINTS[name].pathOrUrl;
}

function pickOne() {
  for (const v of arguments) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function pickFromObject(input, keys) {
  if (!input || typeof input !== "object") return undefined;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined && input[k] !== null && input[k] !== "") {
      return input[k];
    }
  }
  return undefined;
}

function getErrcode(resp) {
  const code = pickOne(resp?.errcode, resp?.code, resp?.data?.errcode, resp?.data?.code);
  return typeof code === "number" ? code : null;
}

function assertBusinessSuccess(action, resp) {
  const code = getErrcode(resp);
  if (code !== null && code !== 0) {
    const desc = pickOne(resp?.description, resp?.message, resp?.data?.description, resp?.data?.message, "");
    throw new Error(\`[\${action}] failed: errcode=\${code} \${desc}\`.trim());
  }
}

function extractData(resp) {
  if (!resp || typeof resp !== "object") return resp;
  return pickOne(resp?.data?.data, resp?.data?.list, resp?.data?.rows, resp?.data, resp);
}

function hasVisibleData(resp) {
  const data = extractData(resp);
  if (data === undefined || data === null || data === "") return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "object") return Object.keys(data).length > 0;
  return true;
}

function isWriteOrWorkflow(op) {
  const text = String(op || "");
  return text.startsWith("write:") || text.startsWith("workflow:");
}

module.exports = function ${apiName}({ client, openapiHost = process.env.OPENAPI_HOST || "https://api.kingdee.com", overrideHost = false } = {}) {
  if (typeof client !== "function") {
    throw new Error("client(req) function is required");
  }

  function getRequestUrl(name, opts = {}) {
    const meta = ENDPOINTS[name];
    if (!meta) throw new Error(\`Unknown endpoint action: \${name}\`);
    return buildUrl({
      openapiHost,
      endpointUrl: meta.pathOrUrl,
      overrideHost: opts.overrideHost !== undefined ? opts.overrideHost : overrideHost,
    });
  }

  async function callEndpoint(name, payload, opts = {}) {
    const meta = ENDPOINTS[name];
    if (!meta) throw new Error(\`Endpoint for action \${name} is not configured\`);
    const method = String(meta.method || "POST").toUpperCase();
    const finalUrl = getRequestUrl(name, opts);
    const isWrite = isWriteOrWorkflow(meta.op);
    const isBodyMethod = method === "POST" || method === "PUT" || method === "PATCH";
    const headers = buildHeaders({
      defaultHeaders: {},
      extraHeaders: opts.headers || {},
      isWrite,
      isBodyMethod,
      idempotencyKey: opts.idempotencyKey,
      idempotencyTimeoutSec: opts.idempotencyTimeoutSec,
      payload: payload || {},
      enableIdempotency: opts.enableIdempotency !== false,
    });
    safeLog("[REQ]", { action: name, method, url: finalUrl, headers: maskSensitiveHeadersForLog(headers) });
    const req = { method, url: finalUrl };
    if (method === "GET") {
      req.params = payload || {};
      req.data = {};
    } else {
      req.params = opts.params || {};
      req.data = payload || {};
    }
    req.headers = headers;

    if (isWrite) {
      const retryOptions = opts.retry || {};
      const retryLogger =
        typeof opts.logger === "function"
          ? opts.logger
          : (info) => safeLog("[RETRY]", { action: name, ...info });
      return withRetry(() => client(req), {
        maxRetries: retryOptions.maxRetries,
        baseDelayMs: retryOptions.baseDelayMs,
        logger: retryLogger,
        sleep: retryOptions.sleep,
        jitterFn: retryOptions.jitterFn,
      });
    }
    return client(req);
  }

  function inferVerifyCriteria(resp, payload, extra) {
    const responseData = extractData(resp);
    const id = pickOne(
      extra?.id,
      pickFromObject(payload, ["id", "Id", "FID", "fid"]),
      pickFromObject(responseData, ["id", "Id", "FID", "fid"]),
      pickFromObject(resp, ["id", "Id", "FID", "fid"])
    );
    const number = pickOne(
      extra?.number,
      pickFromObject(payload, ["number", "Number", "no", "No", "code", "Code", "billNo", "bill_no", "编码", "单号"]),
      pickFromObject(responseData, ["number", "Number", "no", "No", "code", "Code", "billNo", "bill_no", "编码", "单号"]),
      pickFromObject(resp, ["number", "Number", "no", "No", "code", "Code", "billNo", "bill_no", "编码", "单号"])
    );
    return { id, number };
  }

  async function verifyReadAfterWrite(action, criteria, opts = {}) {
    if (${hasDetail ? "true" : "false"}) {
      if (criteria && (criteria.number !== undefined || criteria.id !== undefined)) {
        try {
          const detailResp = await api.detail({ id: criteria.id, number: criteria.number }, opts);
          assertBusinessSuccess(\`\${action}:detail\`, detailResp);
          if (hasVisibleData(detailResp)) return detailResp;
        } catch (err) {
          safeLog("[VERIFY]", { action, step: "detail", message: err.message });
        }
      }
    }
    if (${hasList ? "true" : "false"}) {
      const filters = {};
      if (criteria && criteria.number !== undefined) filters.number = criteria.number;
      if (criteria && criteria.id !== undefined) filters.id = criteria.id;
      const listResp = await api.list({ page: 1, pageSize: 1, filters }, opts);
      assertBusinessSuccess(\`\${action}:list\`, listResp);
      if (hasVisibleData(listResp)) return listResp;
    }
    throw new Error(\`[\${action}] read-after-write verification failed\`);
  }

  async function verifyDelete(action, criteria, opts = {}) {
    if (${hasDetail ? "true" : "false"} && criteria && criteria.id !== undefined) {
      try {
        const detailResp = await api.detail({ id: criteria.id }, opts);
        assertBusinessSuccess(\`\${action}:detail\`, detailResp);
        if (hasVisibleData(detailResp)) {
          throw new Error("resource still visible in detail");
        }
        return;
      } catch (err) {
        safeLog("[VERIFY]", { action, step: "detail", message: err.message });
        if (String(err.message || "").includes("resource still visible")) {
          throw err;
        }
      }
    }
    if (${hasList ? "true" : "false"}) {
      const filters = {};
      if (criteria && criteria.id !== undefined) filters.id = criteria.id;
      const listResp = await api.list({ page: 1, pageSize: 1, filters }, opts);
      assertBusinessSuccess(\`\${action}:list\`, listResp);
      if (hasVisibleData(listResp)) {
        throw new Error(\`[\${action}] delete verification failed: resource still visible in list\`);
      }
      return;
    }
    throw new Error(\`[\${action}] delete verification needs detail or list endpoint\`);
  }

  const api = { getRequestUrl };

${availableMethodNames.includes("list")
    ? `  api.list = async function list({ page = 1, pageSize = 50, filters = {}, updatedAfter, updatedBefore } = {}, opts = {}) {
    const payload = Object.assign({}, filters || {});
    payload.page = page;
    payload.pageSize = pageSize;
    if (updatedAfter !== undefined) payload.updatedAfter = updatedAfter;
    if (updatedBefore !== undefined) payload.updatedBefore = updatedBefore;
    return callEndpoint("list", payload, opts);
  };`
    : ""}

${availableMethodNames.includes("detail")
    ? `  api.detail = async function detail({ id, number } = {}, opts = {}) {
    if (id === undefined && number === undefined) {
      throw new Error("detail requires id or number");
    }
    const payload = {};
    if (id !== undefined) payload.id = id;
    if (number !== undefined) payload.number = number;
    return callEndpoint("detail", payload, opts);
  };`
    : ""}

${availableMethodNames.includes("save")
    ? `  api.save = async function save(model, opts = {}) {
    if (!model || typeof model !== "object") throw new Error("save(model) requires object model");
    const resp = await callEndpoint("save", model, opts);
    assertBusinessSuccess("save", resp);
    const criteria = inferVerifyCriteria(resp, model, {});
    await verifyReadAfterWrite("save", criteria, opts);
    return resp;
  };`
    : ""}

${availableMethodNames.includes("create")
    ? `  api.create = async function create(model, opts = {}) {
    if (!model || typeof model !== "object") throw new Error("create(model) requires object model");
    const resp = await callEndpoint("create", model, opts);
    assertBusinessSuccess("create", resp);
    const criteria = inferVerifyCriteria(resp, model, {});
    await verifyReadAfterWrite("create", criteria, opts);
    return resp;
  };`
    : ""}

${availableMethodNames.includes("update")
    ? `  api.update = async function update({ id } = {}, model = {}, opts = {}) {
    if (id === undefined) throw new Error("update({id}, model) requires id");
    const payload = Object.assign({}, model || {}, { id });
    const resp = await callEndpoint("update", payload, opts);
    assertBusinessSuccess("update", resp);
    const criteria = inferVerifyCriteria(resp, payload, { id });
    await verifyReadAfterWrite("update", criteria, opts);
    return resp;
  };`
    : ""}

${availableMethodNames.includes("delete")
    ? `  api.delete = async function remove({ id } = {}, opts = {}) {
    if (id === undefined) throw new Error("delete({id}) requires id");
    const resp = await callEndpoint("delete", { id }, opts);
    assertBusinessSuccess("delete", resp);
    await verifyDelete("delete", { id }, opts);
    return resp;
  };`
    : ""}

${workflowNames
    .filter((name) => availableMethodNames.includes(name))
    .map(
      (name) => `  api.${name} = async function ${name}({ id } = {}, opts = {}) {
    if (id === undefined) throw new Error("${name}({id}) requires id");
    const resp = await callEndpoint("${name}", { id }, opts);
    assertBusinessSuccess("${name}", resp);
    await verifyReadAfterWrite("${name}", { id }, opts);
    return resp;
  };`
    )
    .join("\n\n")}

  return api;
};
`;
}

function buildIndexModule(objectKeys) {
  const imports = objectKeys
    .map((k) => `const create${toPascalCase(k)}Api = require("./resources/${k}.cjs");`)
    .join("\n");

  const objectEntries = objectKeys.map((k) => `    ${k}: create${toPascalCase(k)}Api(ctx),`).join("\n");
  const exportsList = ["createApi", ...objectKeys.map((k) => `create${toPascalCase(k)}Api`)].join(", ");

  return `${imports}

function createApi(ctx = {}) {
  return {
${objectEntries}
  };
}

module.exports = { ${exportsList} };
`;
}

function buildSampleScript(objectKey) {
  return `require("dotenv").config();
const { createClient } = require("../../assets/runtime/kdClient.cjs");
const { createApi } = require("../sdk/index.cjs");

function responseKeys(resp) {
  if (!resp || typeof resp !== "object") return [];
  return Object.keys(resp);
}

async function main() {
  const { client, domain } = await createClient();
  const openapiHost = process.env.OPENAPI_HOST || "https://api.kingdee.com";
  const api = createApi({ client, openapiHost });
  const resource = api.${objectKey};
  if (!resource) throw new Error("resource api not found");

  console.log(\`[INFO] DOMAIN=\${domain}\`);
  console.log(\`[INFO] OPENAPI_HOST=\${openapiHost}\`);

  if (typeof resource.list === "function") {
    console.log(\`[URL] list -> \${resource.getRequestUrl("list")}\`);
    const listResp = await resource.list({ page: 1, pageSize: 5, filters: {} });
    console.log("[OK] list keys:", responseKeys(listResp).join(", "));
  }

  if (typeof resource.detail === "function") {
    const sampleId = process.env.SAMPLE_ID;
    const sampleNumber = process.env.SAMPLE_NUMBER;
    if (!sampleId && !sampleNumber) {
      console.log("[SKIP] detail requires SAMPLE_ID or SAMPLE_NUMBER");
    } else {
      console.log(\`[URL] detail -> \${resource.getRequestUrl("detail")}\`);
      const detailResp = await resource.detail({ id: sampleId, number: sampleNumber });
      console.log("[OK] detail keys:", responseKeys(detailResp).join(", "));
    }
  }

  if (typeof resource.save === "function") {
    const rawModel = process.env.SAMPLE_SAVE_MODEL;
    if (!rawModel) {
      console.log("[SKIP] save requires SAMPLE_SAVE_MODEL as JSON string");
    } else {
      let model;
      try {
        model = JSON.parse(rawModel);
      } catch (err) {
        throw new Error(\`SAMPLE_SAVE_MODEL is not valid JSON: \${err.message}\`);
      }
      console.log(\`[URL] save -> \${resource.getRequestUrl("save")}\`);
      const saveResp = await resource.save(model);
      console.log("[OK] save keys:", responseKeys(saveResp).join(", "));
    }
  }
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
`;
}

function groupByObject(taggedEndpoints) {
  const out = new Map();
  for (const ep of taggedEndpoints) {
    const key = ep.objectKey;
    if (!key) continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(ep);
  }
  return out;
}

function generateSdk({ taggedEndpoints, outputDir }) {
  const grouped = groupByObject(taggedEndpoints || []);
  const objectKeys = [...grouped.keys()].sort();
  if (objectKeys.length === 0) {
    throw new Error("No objectKey found in tagged endpoints");
  }

  const sdkDir = path.join(outputDir, "sdk");
  const coreDir = path.join(sdkDir, "core");
  const resourcesDir = path.join(sdkDir, "resources");
  const scriptsDir = path.join(outputDir, "scripts");
  ensureDir(coreDir);
  ensureDir(resourcesDir);
  ensureDir(scriptsDir);

  fs.writeFileSync(path.join(coreDir, "url.cjs"), buildCoreUrlModule(), "utf8");
  fs.writeFileSync(path.join(coreDir, "assert.cjs"), buildCoreAssertModule(), "utf8");
  fs.writeFileSync(path.join(coreDir, "headers.cjs"), buildCoreHeadersModule(), "utf8");
  fs.writeFileSync(path.join(coreDir, "retry.cjs"), buildCoreRetryModule(), "utf8");

  for (const objectKey of objectKeys) {
    const filePath = path.join(resourcesDir, `${objectKey}.cjs`);
    const content = buildResourceModule(objectKey, grouped.get(objectKey));
    fs.writeFileSync(filePath, content, "utf8");

    const samplePath = path.join(scriptsDir, `${objectKey}.sample.cjs`);
    fs.writeFileSync(samplePath, buildSampleScript(objectKey), "utf8");
  }

  fs.writeFileSync(path.join(sdkDir, "index.cjs"), buildIndexModule(objectKeys), "utf8");

  return {
    objectCount: objectKeys.length,
    objectKeys,
    outputDir,
    files: {
      coreUrl: path.join(coreDir, "url.cjs"),
      coreAssert: path.join(coreDir, "assert.cjs"),
      coreHeaders: path.join(coreDir, "headers.cjs"),
      coreRetry: path.join(coreDir, "retry.cjs"),
      index: path.join(sdkDir, "index.cjs"),
    },
  };
}

function readTaggedEndpoints(taggedPath) {
  if (!isFile(taggedPath)) {
    throw new Error(`Tagged endpoints not found: ${taggedPath}`);
  }
  const content = fs.readFileSync(taggedPath, "utf8");
  const json = JSON.parse(content);
  if (!Array.isArray(json)) {
    throw new Error("endpoints.tagged.json must be an array");
  }
  return json;
}

module.exports = {
  generateSdk,
  readTaggedEndpoints,
  choosePrimaryEndpoint,
  buildResourceModule,
  buildCoreHeadersModule,
  buildCoreRetryModule,
};
