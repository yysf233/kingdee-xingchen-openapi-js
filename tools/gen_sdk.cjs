const path = require("path");
const { generateSdk, readTaggedEndpoints } = require("./lib/generator.cjs");

function run() {
  const skillRoot = path.resolve(__dirname, "..");
  const taggedPath = path.join(skillRoot, "references", "openapi", "_derived", "endpoints.tagged.json");
  let taggedEndpoints;
  try {
    taggedEndpoints = readTaggedEndpoints(taggedPath);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    console.error("[HINT] Run: node tools/tag_endpoints.cjs");
    process.exit(1);
  }

  const outputDir = path.join(skillRoot, "generated");
  const result = generateSdk({ taggedEndpoints, outputDir });
  console.log(`[OK] generated SDK for ${result.objectCount} objects`);
  console.log(`[OK] output: ${result.outputDir}`);
}

if (require.main === module) {
  run();
}

module.exports = { run };
