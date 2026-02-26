const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateSdk } = require("../lib/generator.cjs");

function hasFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

test("generator emits sdk/core/resources/index/scripts for 3 object keys", () => {
  const taggedEndpoints = [
    {
      objectKey: "customer",
      group: "客户",
      module: "基础资料",
      title: "客户列表",
      method: "GET",
      pathOrUrl: "/jdy/v2/bd/customer_list",
      isRelative: true,
      docPath: "docs/客户列表.md",
      tags: { op: "read:list", entityType: "masterdata", sync: ["sync:needs-polling"], id: ["id:number"] },
    },
    {
      objectKey: "customer",
      group: "客户",
      module: "基础资料",
      title: "客户详情",
      method: "GET",
      pathOrUrl: "/jdy/v2/bd/customer_detail",
      isRelative: true,
      docPath: "docs/客户详情.md",
      tags: { op: "read:detail", entityType: "masterdata", sync: ["sync:needs-polling"], id: ["id:number"] },
    },
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
    {
      objectKey: "saleOrder",
      group: "销售订单",
      module: "进销存云",
      title: "销售订单列表",
      method: "GET",
      pathOrUrl: "/jdy/v2/scm/sale_order_list",
      isRelative: true,
      docPath: "docs/销售订单列表.md",
      tags: { op: "read:list", entityType: "document", sync: ["sync:full-ok"], id: ["id:number"] },
    },
    {
      objectKey: "saleOrder",
      group: "销售订单",
      module: "进销存云",
      title: "销售订单详情",
      method: "GET",
      pathOrUrl: "/jdy/v2/scm/sale_order_detail",
      isRelative: true,
      docPath: "docs/销售订单详情.md",
      tags: { op: "read:detail", entityType: "document", sync: ["sync:full-ok"], id: ["id:number"] },
    },
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
    {
      objectKey: "inventory",
      group: "库存",
      module: "进销存云",
      title: "库存列表",
      method: "GET",
      pathOrUrl: "/jdy/v2/scm/inventory_list",
      isRelative: true,
      docPath: "docs/库存列表.md",
      tags: { op: "read:list", entityType: "masterdata", sync: ["sync:full-ok"], id: ["id:number"] },
    },
    {
      objectKey: "inventory",
      group: "库存",
      module: "进销存云",
      title: "库存修改",
      method: "POST",
      pathOrUrl: "/jdy/v2/scm/inventory_update",
      isRelative: true,
      docPath: "docs/库存修改.md",
      tags: { op: "write:update", entityType: "masterdata", sync: ["sync:write-ok"], id: ["id:number"] },
    },
  ];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-gen-"));
  const outDir = path.join(tmpDir, "generated");
  const result = generateSdk({ taggedEndpoints, outputDir: outDir });
  assert.equal(result.objectCount, 3);

  assert.equal(hasFile(path.join(outDir, "sdk", "core", "url.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "core", "assert.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "core", "headers.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "core", "retry.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "index.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "resources", "customer.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "resources", "saleOrder.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "sdk", "resources", "inventory.cjs")), true);
  assert.equal(hasFile(path.join(outDir, "scripts", "customer.sample.cjs")), true);

  const customerContent = fs.readFileSync(path.join(outDir, "sdk", "resources", "customer.cjs"), "utf8");
  assert.match(customerContent, /function createCustomerApi/);
  assert.match(customerContent, /api\.list = async function list/);
  assert.match(customerContent, /api\.save = async function save/);
  assert.match(customerContent, /buildHeaders/);
  assert.match(customerContent, /withRetry/);

  const indexContent = fs.readFileSync(path.join(outDir, "sdk", "index.cjs"), "utf8");
  assert.match(indexContent, /function createApi/);
  assert.match(indexContent, /createSaleOrderApi/);
});
