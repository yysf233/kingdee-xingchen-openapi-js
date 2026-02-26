const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const OP_ENUM = [
  "read:list",
  "read:detail",
  "write:create",
  "write:update",
  "write:upsert",
  "write:delete",
  "workflow:submit",
  "workflow:audit",
  "workflow:unaudit",
  "workflow:cancel",
  "workflow:close",
  "workflow:open",
  "workflow:disable",
  "workflow:enable",
  "io:import",
  "io:export",
  "io:print",
  "other",
];

const ENTITY_ENUM = ["masterdata", "document", "other"];

const SYNC_ENUM = [
  "sync:full-ok",
  "sync:incremental-ok",
  "sync:needs-polling",
  "sync:write-ok",
  "sync:workflow-ok",
];

const ID_ENUM = ["id:internal", "id:number", "id:externalKey"];

const MASTERDATA_KEYWORDS = [
  "客户",
  "供应商",
  "商品",
  "物料",
  "仓库",
  "单位",
  "部门",
  "员工",
  "职员",
  "科目",
  "结算",
  "计量",
  "价格",
  "类别",
  "档案",
  "品牌",
  "门店",
  "账户",
];

const DOCUMENT_KEYWORDS = [
  "订单",
  "出库",
  "入库",
  "收款",
  "付款",
  "应收",
  "应付",
  "凭证",
  "发票",
  "调拨",
  "盘点",
  "退货",
  "报销",
  "单据",
  "核销",
];

const PAGINATION_HINTS = ["page", "pagesize", "limit", "offset"];
const INCREMENTAL_HINTS = [
  "updated",
  "modify",
  "last",
  "starttime",
  "endtime",
  "begin",
  "datefrom",
  "dateto",
  "更新时间",
  "修改时间",
];
const INTERNAL_ID_HINTS = [" id ", "主键", "\"id\"", "'id'"];
const NUMBER_ID_HINTS = ["number", " no ", "code", "编码", "单号"];
const EXTERNAL_ID_HINTS = ["external", "第三方", "外部", "对接"];

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function firstDefined(values) {
  for (const item of values) {
    if (item === undefined || item === null) continue;
    if (typeof item === "string" && !item.trim()) continue;
    return item;
  }
  return null;
}

function normalizeString(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function shortHash(input, len = 6) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, len);
}

function toCamelCase(input) {
  const parts = String(input)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  const [head, ...tail] = parts;
  return head.toLowerCase() + tail.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join("");
}

function slugifyAscii(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMapKey(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\/_.:|()（）【】\[\]-]/g, "");
}

function cleanupGroupTitle(title) {
  let s = normalizeString(title);
  if (!s) return s;
  s = s.replace(
    /(列表|详情|保存|新增|创建|修改|更新|删除|导入|导出|打印|审核|反审核|提交|作废|取消|关闭|反关闭|启用|禁用|批量保存|查询|检索|分页|明细|汇总|下推|冲销|退货)/g,
    ""
  );
  s = s.replace(
    /\b(list|detail|save|create|add|update|edit|delete|remove|import|export|print|audit|unaudit|submit|cancel|close|open|enable|disable|query|search|get|page)\b/gi,
    ""
  );
  s = s.replace(/[-_/|()（）【】\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return s || normalizeString(title);
}

function pickPathOrUrl(record) {
  const url = firstDefined([
    record.url,
    record.api_url,
    record.apiUrl,
    record.request_url,
    record.requestUrl,
    record.endpoint_url,
    record.endpointUrl,
  ]);
  const p = firstDefined([record.path, record.api_path, record.apiPath, record.endpoint, record.uri]);
  return normalizeString(url || p);
}

function isAbsoluteUrl(v) {
  return /^https?:\/\//i.test(normalizeString(v));
}

function resolveDocAbsolutePath(docPath, docsDir) {
  const p = normalizeString(docPath);
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  if (!docsDir) return null;

  const normalized = p.replace(/\\/g, "/");
  if (normalized.startsWith("docs/")) {
    return path.join(docsDir, normalized.slice("docs/".length));
  }
  return path.join(docsDir, normalized);
}

function parseDocMeta(docAbsolutePath, cache) {
  if (!docAbsolutePath || !isFile(docAbsolutePath)) return {};
  if (cache.has(docAbsolutePath)) return cache.get(docAbsolutePath);

  const text = fs.readFileSync(docAbsolutePath, "utf8");
  const oneLine = text.replace(/\r?\n/g, " ");

  const methodMatch =
    text.match(/(?:请求方式|method)[^\n\r]{0,30}\b(GET|POST|PUT|DELETE|PATCH)\b/i) ||
    text.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+https?:\/\/[^\s)`"'<>]+/i) ||
    text.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+\/jdy\/[^\s)`"'<>]+/i);

  const absoluteUrlMatch = text.match(/https?:\/\/api\.kingdee\.com[^\s)`"'<>]+/i);
  const relativePathMatch = text.match(/\/jdy\/v\d+\/[a-z0-9_\/-]+/i);

  const parsed = {
    method: methodMatch ? methodMatch[1].toUpperCase() : null,
    url: absoluteUrlMatch ? absoluteUrlMatch[0] : null,
    path: relativePathMatch ? relativePathMatch[0] : null,
    text: oneLine.slice(0, 16000),
  };

  cache.set(docAbsolutePath, parsed);
  return parsed;
}

function inferModule(record) {
  const moduleRaw = firstDefined([
    record.module,
    record.modules,
    record.category,
    record.catalog,
    record.classify,
    record.classification,
  ]);
  if (Array.isArray(moduleRaw)) {
    return moduleRaw.map((v) => normalizeString(v)).filter(Boolean).join(" / ") || "unknown";
  }
  if (normalizeString(moduleRaw)) return normalizeString(moduleRaw);

  const target = normalizeString(record.target || record.biz_target || record.bizTarget);
  if (target) {
    const chunk = target.split(/[/:|]/).filter(Boolean)[0];
    if (chunk) return chunk;
  }
  const docPath = normalizeString(record.doc_path || record.docPath);
  if (docPath) {
    const file = path.basename(docPath);
    if (file) return "docs";
  }
  return "unknown";
}

function inferGroup(record) {
  const explicit = firstDefined([
    record.group,
    record.object,
    record.entity,
    record.biz_object,
    record.bizObject,
    record.target,
    record.biz_target,
    record.bizTarget,
  ]);
  if (normalizeString(explicit)) {
    return cleanupGroupTitle(String(explicit).split(/[/:|]/).pop());
  }

  const moduleRaw = firstDefined([record.module, record.modules]);
  if (Array.isArray(moduleRaw) && moduleRaw.length > 0) {
    const tail = moduleRaw[moduleRaw.length - 1];
    if (normalizeString(tail)) return cleanupGroupTitle(tail);
  }

  const title = normalizeString(record.title || record.name);
  if (title) return cleanupGroupTitle(title);

  const docPath = normalizeString(record.doc_path || record.docPath);
  if (docPath) return cleanupGroupTitle(path.basename(docPath, path.extname(docPath)));
  return "unknown";
}

function normalizeRecord(record, options = {}) {
  const docsDir = options.docsDir || null;
  const docCache = options.docCache || new Map();

  const title = normalizeString(firstDefined([record.title, record.name, record.api_name, record.apiName])) || "Untitled";
  const module = inferModule(record);
  const group = inferGroup(record);

  let method = normalizeString(firstDefined([record.method, record.http_method, record.httpMethod])).toUpperCase();
  if (!method) method = "";

  const docPath = normalizeString(firstDefined([record.doc_path, record.docPath, record.doc])) || "";
  const docAbsolutePath = resolveDocAbsolutePath(docPath, docsDir);
  const docMeta = parseDocMeta(docAbsolutePath, docCache);

  let pathOrUrl = pickPathOrUrl(record);
  if (!pathOrUrl && docMeta.url) pathOrUrl = docMeta.url;
  if (!pathOrUrl && docMeta.path) pathOrUrl = docMeta.path;
  if (!method && docMeta.method) method = docMeta.method;

  const isRelative = !!pathOrUrl && !isAbsoluteUrl(pathOrUrl);

  return {
    module,
    group,
    title,
    method: method || null,
    pathOrUrl: pathOrUrl || null,
    isRelative,
    docPath: docPath || null,
    docText: docMeta.text || "",
    raw: record,
  };
}

function containsAny(text, rules) {
  const s = String(text || "");
  return rules.some((rule) => {
    if (rule instanceof RegExp) return rule.test(s);
    return s.includes(String(rule));
  });
}

function inferOp(input) {
  const s = String(input?.text || "").toLowerCase();
  const method = normalizeString(input?.method).toUpperCase();

  const workflowRules = [
    ["workflow:unaudit", ["反审核", "unaudit", "unapprove"]],
    ["workflow:audit", ["审核", "audit", "approve"]],
    ["workflow:submit", ["提交", "submit"]],
    ["workflow:cancel", ["作废", "取消", /\bcancel\b/i, /\bvoid\b/i]],
    ["workflow:open", ["反关闭", /\breopen\b/i, /\bunclose\b/i]],
    ["workflow:close", ["关闭", /\bclose\b/i]],
    ["workflow:enable", ["启用", /\benable\b/i]],
    ["workflow:disable", ["禁用", /\bdisable\b/i]],
  ];
  for (const [op, rules] of workflowRules) {
    if (containsAny(s, rules)) return op;
  }

  const ioRules = [
    ["io:import", ["导入", /\bimport\b/i]],
    ["io:export", ["导出", /\bexport\b/i]],
    ["io:print", ["打印", /\bprint\b/i]],
  ];
  for (const [op, rules] of ioRules) {
    if (containsAny(s, rules)) return op;
  }

  const writeRules = [
    ["write:delete", ["删除", /\bdelete\b/i, /\bremove\b/i]],
    ["write:create", ["新增", "创建", /\bcreate\b/i, /\badd\b/i]],
    ["write:update", ["修改", "更新", /\bupdate\b/i, /\bedit\b/i]],
    ["write:upsert", ["保存", /\bsave\b/i]],
  ];
  for (const [op, rules] of writeRules) {
    if (containsAny(s, rules)) return op;
  }

  const readRules = [
    ["read:detail", ["详情", "明细", /\bdetail\b/i, /\bget\b/i]],
    ["read:list", ["列表", "检索", "查询", "分页", /\blist\b/i, /\bsearch\b/i, /\bquery\b/i]],
  ];
  for (const [op, rules] of readRules) {
    if (containsAny(s, rules)) return op;
  }

  if (method === "GET") return "read:list";
  if (method) return "write:upsert";
  return "other";
}

function inferEntityType(input) {
  const text = String(input || "");
  const masterScore = MASTERDATA_KEYWORDS.reduce((n, k) => (text.includes(k) ? n + 1 : n), 0);
  const documentScore = DOCUMENT_KEYWORDS.reduce((n, k) => (text.includes(k) ? n + 1 : n), 0);

  if (masterScore === 0 && documentScore === 0) return "other";
  if (documentScore > masterScore) return "document";
  if (masterScore > documentScore) return "masterdata";
  return "other";
}

function createDefaultObjectMap() {
  return {
    customer: "customer",
    "客户": "customer",
    supplier: "supplier",
    "供应商": "supplier",
    item: "item",
    goods: "item",
    material: "item",
    "商品": "item",
    "物料": "item",
    inventory: "inventory",
    "库存": "inventory",
    saleorder: "saleOrder",
    "销售订单": "saleOrder",
    purchaseorder: "purchaseOrder",
    "采购订单": "purchaseOrder",
    stockin: "stockIn",
    "入库单": "stockIn",
    stockout: "stockOut",
    "出库单": "stockOut",
    invoice: "invoice",
    "发票": "invoice",
    warehouse: "warehouse",
    "仓库": "warehouse",
  };
}

function ensureObjectMap(mapPath) {
  const defaults = createDefaultObjectMap();
  if (!isFile(mapPath)) {
    fs.mkdirSync(path.dirname(mapPath), { recursive: true });
    fs.writeFileSync(mapPath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
    return { map: defaults, created: true };
  }

  const content = fs.readFileSync(mapPath, "utf8");
  const loaded = JSON.parse(content);
  return {
    map: loaded && typeof loaded === "object" ? loaded : {},
    created: false,
  };
}

function resolveObjectKey(group, objectMap) {
  const cleanGroup = normalizeString(group) || "unknown";
  const mapKey = normalizeMapKey(cleanGroup);
  const direct = objectMap[mapKey] || objectMap[cleanGroup] || objectMap[cleanGroup.toLowerCase()];
  if (direct) {
    const normalized = normalizeString(direct);
    if (/^[a-z][a-zA-Z0-9]*$/.test(normalized)) {
      return normalized;
    }
    const camel = toCamelCase(normalized);
    return camel || normalized;
  }

  const slug = slugifyAscii(cleanGroup) || "object";
  const key = `${slug}-${shortHash(cleanGroup, 6)}`;
  return toCamelCase(key);
}

function hasAnyHint(texts, hints) {
  const whole = texts.join(" ").toLowerCase();
  return hints.some((hint) => whole.includes(String(hint).toLowerCase()));
}

function buildSummary(taggedEndpoints, sourceInfo, missingObjectMap) {
  const byModule = new Map();
  const byObject = new Map();
  const ops = new Set();
  const syncs = new Set();

  for (const ep of taggedEndpoints) {
    ops.add(ep.tags.op);
    for (const s of ep.tags.sync) syncs.add(s);

    if (!byModule.has(ep.module)) {
      byModule.set(ep.module, {
        module: ep.module,
        objectKeys: new Set(),
        endpointCount: 0,
        ops: new Set(),
      });
    }
    const moduleBucket = byModule.get(ep.module);
    moduleBucket.objectKeys.add(ep.objectKey);
    moduleBucket.endpointCount += 1;
    moduleBucket.ops.add(ep.tags.op);

    if (!byObject.has(ep.objectKey)) {
      byObject.set(ep.objectKey, {
        objectKey: ep.objectKey,
        group: ep.group,
        module: ep.module,
        entityType: ep.tags.entityType,
        endpointCount: 0,
        ops: new Set(),
        sync: new Set(),
      });
    }
    const objBucket = byObject.get(ep.objectKey);
    objBucket.endpointCount += 1;
    objBucket.ops.add(ep.tags.op);
    ep.tags.sync.forEach((v) => objBucket.sync.add(v));
  }

  const modules = [...byModule.values()]
    .map((v) => ({
      module: v.module,
      objectCount: v.objectKeys.size,
      endpointCount: v.endpointCount,
      opCoverage: [...v.ops].sort(),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));

  const objects = [...byObject.values()]
    .map((v) => ({
      objectKey: v.objectKey,
      group: v.group,
      module: v.module,
      entityType: v.entityType,
      endpointCount: v.endpointCount,
      opCoverage: [...v.ops].sort(),
      syncCoverage: [...v.sync].sort(),
    }))
    .sort((a, b) => a.objectKey.localeCompare(b.objectKey));

  return {
    generatedAt: new Date().toISOString(),
    source: sourceInfo,
    counts: {
      endpoints: taggedEndpoints.length,
      objects: objects.length,
      modules: modules.length,
    },
    coverage: {
      opCoverage: [...ops].sort(),
      syncCoverage: [...syncs].sort(),
    },
    missingObjectMap,
    modules,
    objects,
  };
}

function buildTaggedEndpoints(records, options = {}) {
  const docsDir = options.docsDir || null;
  const objectMap = options.objectMap || {};
  const sourceInfo = options.sourceInfo || {};
  const docCache = new Map();
  const missingObjectMap = [];
  const seenMissing = new Set();

  const normalized = records.map((record) => normalizeRecord(record, { docsDir, docCache }));
  const tagged = normalized.map((item) => {
    const rawDesc = normalizeString(
      firstDefined([
        item.raw?.description,
        item.raw?.desc,
        item.raw?.summary,
        item.raw?.remark,
      ])
    );
    const opText = [item.title, item.pathOrUrl, item.docPath, rawDesc].filter(Boolean).join(" ");
    const op = inferOp({ text: opText, method: item.method });
    const entity = inferEntityType(`${item.group} ${item.title} ${item.module}`);
    const objectKey = resolveObjectKey(item.group, objectMap);

    const mapKey = normalizeMapKey(item.group);
    if (!(objectMap[mapKey] || objectMap[item.group] || objectMap[item.group.toLowerCase()])) {
      if (!seenMissing.has(item.group)) {
        seenMissing.add(item.group);
        missingObjectMap.push({
          group: item.group,
          suggestedObjectKey: objectKey,
        });
      }
    }

    return {
      module: item.module,
      group: item.group,
      title: item.title,
      method: item.method,
      pathOrUrl: item.pathOrUrl,
      isRelative: item.isRelative,
      docPath: item.docPath,
      objectKey,
      actionKey: op,
      tags: {
        op,
        entityType: entity,
        sync: [],
        id: [],
      },
      raw: item.raw,
      _docText: item.docText,
    };
  });

  const groupStats = new Map();
  for (const ep of tagged) {
    if (!groupStats.has(ep.group)) {
      groupStats.set(ep.group, { total: 0, document: 0, masterdata: 0 });
    }
    const s = groupStats.get(ep.group);
    s.total += 1;
    if (ep.tags.entityType === "document") s.document += 1;
    if (ep.tags.entityType === "masterdata") s.masterdata += 1;
  }
  for (const ep of tagged) {
    const s = groupStats.get(ep.group);
    if (!s || s.total === 0) continue;
    if (s.document / s.total >= 0.6) ep.tags.entityType = "document";
    if (s.masterdata / s.total >= 0.6) ep.tags.entityType = "masterdata";
  }

  const byObject = new Map();
  for (const ep of tagged) {
    if (!byObject.has(ep.objectKey)) byObject.set(ep.objectKey, []);
    byObject.get(ep.objectKey).push(ep);
  }

  for (const endpoints of byObject.values()) {
    const texts = endpoints.map((ep) =>
      [ep.title, ep.pathOrUrl, ep.docPath, ep._docText].filter(Boolean).join(" ").toLowerCase()
    );
    const hasList = endpoints.some((ep) => ep.tags.op === "read:list");
    const hasPagination = hasAnyHint(texts, PAGINATION_HINTS);
    const hasIncremental = hasAnyHint(texts, INCREMENTAL_HINTS);
    const hasWrite = endpoints.some((ep) => ep.tags.op.startsWith("write:"));
    const hasWorkflow = endpoints.some((ep) => ep.tags.op.startsWith("workflow:"));
    const entityType = endpoints[0]?.tags?.entityType || "other";

    const syncTags = [];
    if (hasList && hasPagination) syncTags.push("sync:full-ok");
    if (hasIncremental) syncTags.push("sync:incremental-ok");
    if (!hasIncremental && hasList && (entityType === "masterdata" || entityType === "document")) {
      syncTags.push("sync:needs-polling");
    }
    if (hasWrite) syncTags.push("sync:write-ok");
    if (hasWorkflow) syncTags.push("sync:workflow-ok");

    const idTags = [];
    if (hasAnyHint(texts, INTERNAL_ID_HINTS)) idTags.push("id:internal");
    if (hasAnyHint(texts, NUMBER_ID_HINTS)) idTags.push("id:number");
    if (hasAnyHint(texts, EXTERNAL_ID_HINTS)) idTags.push("id:externalKey");

    for (const ep of endpoints) {
      ep.tags.sync = SYNC_ENUM.filter((x) => syncTags.includes(x));
      ep.tags.id = ID_ENUM.filter((x) => idTags.includes(x));
      delete ep._docText;
    }
  }

  const summary = buildSummary(tagged, sourceInfo, missingObjectMap);
  return { taggedEndpoints: tagged, summary, missingObjectMap };
}

function readManifestRecords(manifestPath) {
  const lines = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean);
  const records = [];
  let firstKeys = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    try {
      const obj = JSON.parse(line);
      if (firstKeys.length === 0) firstKeys = Object.keys(obj);
      records.push(obj);
    } catch (err) {
      throw new Error(`Invalid JSONL at line ${i + 1}: ${err.message}`);
    }
  }
  return { records, firstKeys };
}

module.exports = {
  OP_ENUM,
  ENTITY_ENUM,
  SYNC_ENUM,
  ID_ENUM,
  normalizeRecord,
  inferOp,
  inferEntityType,
  resolveObjectKey,
  createDefaultObjectMap,
  ensureObjectMap,
  buildTaggedEndpoints,
  readManifestRecords,
};
