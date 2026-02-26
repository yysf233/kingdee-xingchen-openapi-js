const { URL } = require("url");

function normalizeHost(host) {
  const h = String(host || process.env.OPENAPI_HOST || "https://api.kingdee.com").trim();
  if (!h) return "https://api.kingdee.com";
  return h.replace(/\/+$/, "");
}

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
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

  const p = raw.startsWith("/") ? raw : `/${raw}`;
  return `${baseHost}${p}`;
}

module.exports = { buildUrl, isAbsoluteUrl, normalizeHost };
