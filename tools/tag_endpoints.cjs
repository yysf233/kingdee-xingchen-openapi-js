const fs = require("fs");
const path = require("path");
const { discoverOpenApiSources } = require("./discover_sources.cjs");
const {
  buildTaggedEndpoints,
  ensureObjectMap,
  readManifestRecords,
} = require("./lib/tagger.cjs");

function parseArgs(argv) {
  const args = { cwd: process.cwd(), debug: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--cwd" && argv[i + 1]) {
      args.cwd = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--debug") {
      args.debug = true;
    }
  }
  return args;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const source = discoverOpenApiSources(args.cwd);

  const { records, firstKeys } = readManifestRecords(source.manifestPath);
  if (args.debug) {
    console.log(`[DEBUG] first record keys: ${firstKeys.join(", ")}`);
  }

  const skillRoot = path.resolve(__dirname, "..");
  const derivedDir = path.join(skillRoot, "references", "openapi", "_derived");
  fs.mkdirSync(derivedDir, { recursive: true });

  const objectMapPath = path.join(derivedDir, "object.map.json");
  const { map: objectMap, created } = ensureObjectMap(objectMapPath);

  const { taggedEndpoints, summary, missingObjectMap } = buildTaggedEndpoints(records, {
    docsDir: source.docsDir,
    objectMap,
    sourceInfo: source,
  });

  const taggedPath = path.join(derivedDir, "endpoints.tagged.json");
  const summaryPath = path.join(derivedDir, "tag.summary.json");

  fs.writeFileSync(taggedPath, `${JSON.stringify(taggedEndpoints, null, 2)}\n`, "utf8");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`[OK] tagged ${taggedEndpoints.length} endpoints`);
  console.log(`[OK] wrote: ${taggedPath}`);
  console.log(`[OK] wrote: ${summaryPath}`);
  if (created) {
    console.log(`[OK] created default object map: ${objectMapPath}`);
  } else {
    console.log(`[OK] used existing object map: ${objectMapPath}`);
  }
  if (missingObjectMap.length > 0) {
    console.log(`[INFO] ${missingObjectMap.length} groups are not mapped in object.map.json (kept fallback keys).`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
