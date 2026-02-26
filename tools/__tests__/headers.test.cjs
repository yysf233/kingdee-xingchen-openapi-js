const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateSdk } = require("../lib/generator.cjs");

function loadHeadersCore() {
  const taggedEndpoints = [
    {
      objectKey: "customer",
      group: "客户",
      module: "基础资料",
      title: "客户保存",
      method: "POST",
      pathOrUrl: "/jdy/v2/bd/customer",
      isRelative: true,
      docPath: "docs/客户保存.md",
      tags: { op: "write:upsert", entityType: "masterdata", sync: ["sync:write-ok"], id: ["id:number"] },
    },
  ];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-headers-"));
  const outDir = path.join(tmpDir, "generated");
  generateSdk({ taggedEndpoints, outputDir: outDir });
  return require(path.join(outDir, "sdk", "core", "headers.cjs"));
}

test("buildHeaders injects default Content-Type for write body requests", () => {
  const { buildHeaders } = loadHeadersCore();
  const headers = buildHeaders({ isWrite: true, isBodyMethod: true, extraHeaders: {} });
  assert.equal(headers["Content-Type"], "application/json");
});

test("buildHeaders respects caller Content-Type override", () => {
  const { buildHeaders } = loadHeadersCore();
  const headers = buildHeaders({
    isWrite: true,
    isBodyMethod: true,
    extraHeaders: { "content-type": "application/custom+json" },
  });
  assert.equal(headers["content-type"], "application/custom+json");
  assert.equal(headers["Content-Type"], undefined);
});

test("Idempotency-Key rule: opts > payload fields > uuid fallback", () => {
  const { buildHeaders } = loadHeadersCore();

  const h1 = buildHeaders({
    isWrite: true,
    idempotencyKey: "idem-from-opts",
    payload: { billNo: "SO-001" },
    uuidFn: () => "uuid-fallback",
  });
  assert.equal(h1["Idempotency-Key"], "idem-from-opts");

  const h2 = buildHeaders({
    isWrite: true,
    payload: { nested: { externalNo: "EXT-88" } },
    uuidFn: () => "uuid-fallback",
  });
  assert.equal(h2["Idempotency-Key"], "EXT-88");

  const h3 = buildHeaders({
    isWrite: true,
    payload: {},
    idempotencyTimeoutSec: 180,
    uuidFn: () => "uuid-fixed-123",
  });
  assert.equal(h3["Idempotency-Key"], "uuid-fixed-123");
  assert.equal(h3["Idempotency-Timeout"], "180");
});

test("maskSensitiveHeadersForLog redacts token/secret/signature and masks idempotency key", () => {
  const { maskSensitiveHeadersForLog } = loadHeadersCore();
  const masked = maskSensitiveHeadersForLog({
    Authorization: "Bearer abc",
    accessToken: "tk-1",
    "X-Api-Signature": "sig-raw",
    "Idempotency-Key": "abcdef123456",
    "Content-Type": "application/json",
  });

  assert.equal(masked.Authorization, "***");
  assert.equal(masked.accessToken, "***");
  assert.equal(masked["X-Api-Signature"], "***");
  assert.equal(masked["Idempotency-Key"], "abcdef***");
  assert.equal(masked["Content-Type"], "application/json");
});
