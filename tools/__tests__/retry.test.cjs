const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateSdk } = require("../lib/generator.cjs");

function loadRetryCore() {
  const taggedEndpoints = [
    {
      objectKey: "saleOrder",
      group: "销售订单",
      module: "进销存云",
      title: "销售订单提交",
      method: "POST",
      pathOrUrl: "/jdy/v2/scm/sale_order_submit",
      isRelative: true,
      docPath: "docs/销售订单提交.md",
      tags: { op: "workflow:submit", entityType: "document", sync: ["sync:workflow-ok"], id: ["id:number"] },
    },
  ];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-retry-"));
  const outDir = path.join(tmpDir, "generated");
  generateSdk({ taggedEndpoints, outputDir: outDir });
  return require(path.join(outDir, "sdk", "core", "retry.cjs"));
}

test("429 should retry up to maxRetries then fail", async () => {
  const { withRetry } = loadRetryCore();
  let calls = 0;
  await assert.rejects(
    async () =>
      withRetry(
        async () => {
          calls += 1;
          const err = new Error("429 Too Many Requests");
          err.status = 429;
          throw err;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1,
          sleep: async () => {},
          jitterFn: () => 0,
        }
      ),
    /429/
  );
  assert.equal(calls, 4);
});

test("400 should not retry", async () => {
  const { withRetry } = loadRetryCore();
  let calls = 0;
  await assert.rejects(
    async () =>
      withRetry(
        async () => {
          calls += 1;
          const err = new Error("400 bad request");
          err.statusCode = 400;
          throw err;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1,
          sleep: async () => {},
          jitterFn: () => 0,
        }
      ),
    /400/
  );
  assert.equal(calls, 1);
});

test("500 should retry", async () => {
  const { withRetry } = loadRetryCore();
  let calls = 0;
  await assert.rejects(
    async () =>
      withRetry(
        async () => {
          calls += 1;
          const err = new Error("server fail");
          err.status = 500;
          throw err;
        },
        {
          maxRetries: 2,
          baseDelayMs: 1,
          sleep: async () => {},
          jitterFn: () => 0,
        }
      ),
    /server fail/
  );
  assert.equal(calls, 3);
});
