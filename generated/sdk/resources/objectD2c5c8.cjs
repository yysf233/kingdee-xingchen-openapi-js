const { buildUrl } = require("../core/url.cjs");
const { safeLog } = require("../core/assert.cjs");

/*
Candidate endpoints (not selected):
read:list: 发票列表 [GET https://api.kingdee.com/jdy/v2/fi/invoice_fp]; 手工开票列表 [GET https://api.kingdee.com/jdy/v2/fp/invoice_kp]
read:detail: 手工开票详情 [GET https://api.kingdee.com/jdy/v2/fp/invoice_kp_detail]
*/
const ENDPOINTS = {
  list: {
  "op": "read:list",
  "title": "销售出库单查询发票信息",
  "method": "GET",
  "pathOrUrl": "https://api.kingdee.com/jdy/v2/fp/invoice_kp_query",
  "isRelative": false,
  "docPath": "docs/销售出库单查询发票信息.md"
},
  detail: {
  "op": "read:detail",
  "title": "发票详情",
  "method": "GET",
  "pathOrUrl": "https://api.kingdee.com/jdy/v2/fi/invoice_detail",
  "isRelative": false,
  "docPath": "docs/发票详情.md"
},
  save: {
  "op": "write:upsert",
  "title": "手工开票保存",
  "method": "POST",
  "pathOrUrl": "https://api.kingdee.com/jdy/v2/fp/invoice_kp",
  "isRelative": false,
  "docPath": "docs/手工开票保存.md"
}
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
    throw new Error(`[${action}] failed: errcode=${code} ${desc}`.trim());
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

module.exports = function createObjectD2c5c8Api({ client, openapiHost = process.env.OPENAPI_HOST || "https://api.kingdee.com", overrideHost = false } = {}) {
  if (typeof client !== "function") {
    throw new Error("client(req) function is required");
  }

  function getRequestUrl(name, opts = {}) {
    const meta = ENDPOINTS[name];
    if (!meta) throw new Error(`Unknown endpoint action: ${name}`);
    return buildUrl({
      openapiHost,
      endpointUrl: meta.pathOrUrl,
      overrideHost: opts.overrideHost !== undefined ? opts.overrideHost : overrideHost,
    });
  }

  async function callEndpoint(name, payload, opts = {}) {
    const meta = ENDPOINTS[name];
    if (!meta) throw new Error(`Endpoint for action ${name} is not configured`);
    const method = String(meta.method || "POST").toUpperCase();
    const finalUrl = getRequestUrl(name, opts);
    safeLog("[REQ]", { action: name, method, url: finalUrl });
    const req = { method, url: finalUrl };
    if (method === "GET") {
      req.params = payload || {};
      req.data = {};
    } else {
      req.params = opts.params || {};
      req.data = payload || {};
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
    if (true) {
      if (criteria && (criteria.number !== undefined || criteria.id !== undefined)) {
        try {
          const detailResp = await api.detail({ id: criteria.id, number: criteria.number }, opts);
          assertBusinessSuccess(`${action}:detail`, detailResp);
          if (hasVisibleData(detailResp)) return detailResp;
        } catch (err) {
          safeLog("[VERIFY]", { action, step: "detail", message: err.message });
        }
      }
    }
    if (true) {
      const filters = {};
      if (criteria && criteria.number !== undefined) filters.number = criteria.number;
      if (criteria && criteria.id !== undefined) filters.id = criteria.id;
      const listResp = await api.list({ page: 1, pageSize: 1, filters }, opts);
      assertBusinessSuccess(`${action}:list`, listResp);
      if (hasVisibleData(listResp)) return listResp;
    }
    throw new Error(`[${action}] read-after-write verification failed`);
  }

  async function verifyDelete(action, criteria, opts = {}) {
    if (true && criteria && criteria.id !== undefined) {
      try {
        const detailResp = await api.detail({ id: criteria.id }, opts);
        assertBusinessSuccess(`${action}:detail`, detailResp);
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
    if (true) {
      const filters = {};
      if (criteria && criteria.id !== undefined) filters.id = criteria.id;
      const listResp = await api.list({ page: 1, pageSize: 1, filters }, opts);
      assertBusinessSuccess(`${action}:list`, listResp);
      if (hasVisibleData(listResp)) {
        throw new Error(`[${action}] delete verification failed: resource still visible in list`);
      }
      return;
    }
    throw new Error(`[${action}] delete verification needs detail or list endpoint`);
  }

  const api = { getRequestUrl };

  api.list = async function list({ page = 1, pageSize = 50, filters = {}, updatedAfter, updatedBefore } = {}, opts = {}) {
    const payload = Object.assign({}, filters || {});
    payload.page = page;
    payload.pageSize = pageSize;
    if (updatedAfter !== undefined) payload.updatedAfter = updatedAfter;
    if (updatedBefore !== undefined) payload.updatedBefore = updatedBefore;
    return callEndpoint("list", payload, opts);
  };

  api.detail = async function detail({ id, number } = {}, opts = {}) {
    if (id === undefined && number === undefined) {
      throw new Error("detail requires id or number");
    }
    const payload = {};
    if (id !== undefined) payload.id = id;
    if (number !== undefined) payload.number = number;
    return callEndpoint("detail", payload, opts);
  };

  api.save = async function save(model, opts = {}) {
    if (!model || typeof model !== "object") throw new Error("save(model) requires object model");
    const resp = await callEndpoint("save", model, opts);
    assertBusinessSuccess("save", resp);
    const criteria = inferVerifyCriteria(resp, model, {});
    await verifyReadAfterWrite("save", criteria, opts);
    return resp;
  };









  return api;
};
