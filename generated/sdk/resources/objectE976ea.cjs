const { buildUrl } = require("../core/url.cjs");
const { safeLog } = require("../core/assert.cjs");

/*
Candidate endpoints (not selected):
read:list: 查询网络锁 [GET https://api.kingdee.com/jdy/v2/sys/mutex_list]; 国家行政区域查询 [GET https://api.kingdee.com/jdy/v2/sys/country_load]; 系统参数查询 [GET https://api.kingdee.com/jdy/v2/sys/system_param]; 省市区查询 [GET https://api.kingdee.com/jdy/v2/sys/division_load]; 当前用户信息查询 [GET https://api.kingdee.com/jdy/v2/sys/current_user_info]; 自定义字段查询（支持多表体） [GET https://api.kingdee.com/jdy/v2/sys/custom_mult_field]; 获取当前用户功能权限 [GET https://api.kingdee.com/jdy/v2/sys/user_func_perm_list]
write:upsert: 第三方消息 [POST https://api.kingdee.com/jdy/v2/sys/outside_msg]; 附件上传 [POST https://api.kingdee.com/jdy/v2/sys/attachment_upload]; 图片上传 [POST https://api.kingdee.com/jdy/v2/basedata/image_upload]
*/
const ENDPOINTS = {
  list: {
  "op": "read:list",
  "title": "用户信息列表",
  "method": "GET",
  "pathOrUrl": "https://api.kingdee.com/jdy/v2/sys/user_list",
  "isRelative": false,
  "docPath": "docs/用户信息列表.md"
},
  save: {
  "op": "write:upsert",
  "title": "单据下推",
  "method": "POST",
  "pathOrUrl": "https://api.kingdee.com/jdy/v2/sys/bill_push",
  "isRelative": false,
  "docPath": "docs/单据下推.md"
},
  unaudit: {
  "op": "workflow:unaudit",
  "title": "通用操作(审核\\反审核\\删除)",
  "method": "POST",
  "pathOrUrl": "https://api.kingdee.com/jdy/v2/sys/common_operate",
  "isRelative": false,
  "docPath": "docs/通用操作(审核-反审核-删除).md"
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

module.exports = function createObjectE976eaApi({ client, openapiHost = process.env.OPENAPI_HOST || "https://api.kingdee.com", overrideHost = false } = {}) {
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
    if (false) {
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
    if (false && criteria && criteria.id !== undefined) {
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



  api.save = async function save(model, opts = {}) {
    if (!model || typeof model !== "object") throw new Error("save(model) requires object model");
    const resp = await callEndpoint("save", model, opts);
    assertBusinessSuccess("save", resp);
    const criteria = inferVerifyCriteria(resp, model, {});
    await verifyReadAfterWrite("save", criteria, opts);
    return resp;
  };







  api.unaudit = async function unaudit({ id } = {}, opts = {}) {
    if (id === undefined) throw new Error("unaudit({id}) requires id");
    const resp = await callEndpoint("unaudit", { id }, opts);
    assertBusinessSuccess("unaudit", resp);
    await verifyReadAfterWrite("unaudit", { id }, opts);
    return resp;
  };

  return api;
};
