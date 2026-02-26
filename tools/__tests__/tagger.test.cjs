const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTaggedEndpoints,
  createDefaultObjectMap,
  resolveObjectKey,
} = require("../lib/tagger.cjs");

test("tagger infers op/entityType/objectKey deterministically with 15 mock endpoints", () => {
  const mockRecords = [
    { title: "客户列表", method: "GET", path: "/jdy/v2/bd/customer_list", group: "客户", module: ["基础资料"] },
    { title: "客户详情", method: "GET", path: "/jdy/v2/bd/customer_detail", group: "客户", module: ["基础资料"] },
    { title: "客户保存", method: "POST", path: "/jdy/v2/bd/customer", group: "客户", module: ["基础资料"] },
    { title: "客户删除", method: "POST", path: "/jdy/v2/bd/customer_delete", group: "客户", module: ["基础资料"] },
    { title: "客户导入", method: "POST", path: "/jdy/v2/bd/customer_import", group: "客户", module: ["基础资料"] },
    { title: "客户导出", method: "GET", path: "/jdy/v2/bd/customer_export", group: "客户", module: ["基础资料"] },
    { title: "客户打印", method: "POST", path: "/jdy/v2/bd/customer_print", group: "客户", module: ["基础资料"] },
    { title: "销售订单新增", method: "POST", path: "/jdy/v2/scm/sale_order_create", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单修改", method: "POST", path: "/jdy/v2/scm/sale_order_update", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单提交", method: "POST", path: "/jdy/v2/scm/sale_order_submit", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单审核", method: "POST", path: "/jdy/v2/scm/sale_order_audit", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单反审核", method: "POST", path: "/jdy/v2/scm/sale_order_unaudit", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单取消", method: "POST", path: "/jdy/v2/scm/sale_order_cancel", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单关闭", method: "POST", path: "/jdy/v2/scm/sale_order_close", group: "销售订单", module: ["进销存云"] },
    { title: "销售订单反关闭", method: "POST", path: "/jdy/v2/scm/sale_order_reopen", group: "销售订单", module: ["进销存云"] },
  ];

  const expectedOps = {
    客户列表: "read:list",
    客户详情: "read:detail",
    客户保存: "write:upsert",
    客户删除: "write:delete",
    客户导入: "io:import",
    客户导出: "io:export",
    客户打印: "io:print",
    销售订单新增: "write:create",
    销售订单修改: "write:update",
    销售订单提交: "workflow:submit",
    销售订单审核: "workflow:audit",
    销售订单反审核: "workflow:unaudit",
    销售订单取消: "workflow:cancel",
    销售订单关闭: "workflow:close",
    销售订单反关闭: "workflow:open",
  };

  const objectMap = createDefaultObjectMap();
  const { taggedEndpoints } = buildTaggedEndpoints(mockRecords, {
    objectMap,
    docsDir: null,
    sourceInfo: { source: "test" },
  });
  assert.equal(taggedEndpoints.length, 15);

  for (const ep of taggedEndpoints) {
    assert.equal(ep.tags.op, expectedOps[ep.title], `op mismatch for ${ep.title}`);
    if (ep.group === "客户") {
      assert.equal(ep.objectKey, "customer");
      assert.equal(ep.tags.entityType, "masterdata");
    }
    if (ep.group === "销售订单") {
      assert.equal(ep.objectKey, "saleOrder");
      assert.equal(ep.tags.entityType, "document");
    }
  }
});

test("fallback objectKey remains stable when mapping misses", () => {
  const objectMap = createDefaultObjectMap();
  const key1 = resolveObjectKey("神秘业务对象", objectMap);
  const key2 = resolveObjectKey("神秘业务对象", objectMap);
  assert.equal(key1, key2);
  assert.match(key1, /^object[A-Za-z0-9]+$/);
});
