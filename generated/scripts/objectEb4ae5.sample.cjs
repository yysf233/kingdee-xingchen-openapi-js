require("dotenv").config();
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
  const resource = api.objectEb4ae5;
  if (!resource) throw new Error("resource api not found");

  console.log(`[INFO] DOMAIN=${domain}`);
  console.log(`[INFO] OPENAPI_HOST=${openapiHost}`);

  if (typeof resource.list === "function") {
    console.log(`[URL] list -> ${resource.getRequestUrl("list")}`);
    const listResp = await resource.list({ page: 1, pageSize: 5, filters: {} });
    console.log("[OK] list keys:", responseKeys(listResp).join(", "));
  }

  if (typeof resource.detail === "function") {
    const sampleId = process.env.SAMPLE_ID;
    const sampleNumber = process.env.SAMPLE_NUMBER;
    if (!sampleId && !sampleNumber) {
      console.log("[SKIP] detail requires SAMPLE_ID or SAMPLE_NUMBER");
    } else {
      console.log(`[URL] detail -> ${resource.getRequestUrl("detail")}`);
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
        throw new Error(`SAMPLE_SAVE_MODEL is not valid JSON: ${err.message}`);
      }
      console.log(`[URL] save -> ${resource.getRequestUrl("save")}`);
      const saveResp = await resource.save(model);
      console.log("[OK] save keys:", responseKeys(saveResp).join(", "));
    }
  }
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
