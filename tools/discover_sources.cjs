const fs = require("fs");
const path = require("path");

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDir(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function walkUpDirs(startDir) {
  const out = [];
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    out.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return out;
}

function findProjectSources(startDir) {
  const dirs = walkUpDirs(startDir);
  for (const dir of dirs) {
    const manifestPath = path.join(dir, "api.manifest.jsonl");
    if (!isFile(manifestPath)) continue;

    const docsCandidate = path.join(dir, "docs");
    const docsDir = isDir(docsCandidate) ? docsCandidate : null;
    return {
      manifestPath,
      docsDir,
      source: "project",
    };
  }
  return null;
}

function discoverOpenApiSources(cwd) {
  const project = findProjectSources(cwd || process.cwd());
  if (project) return project;

  const skillRoot = path.resolve(__dirname, "..");
  const manifestPath = path.join(skillRoot, "references", "openapi", "api.manifest.jsonl");
  const docsCandidate = path.join(skillRoot, "references", "openapi", "docs");
  if (isFile(manifestPath)) {
    return {
      manifestPath,
      docsDir: isDir(docsCandidate) ? docsCandidate : null,
      source: "skill",
    };
  }

  throw new Error(
    "OpenAPI sources not found.\nExpected api.manifest.jsonl in project ancestors or references/openapi."
  );
}

module.exports = {
  discoverOpenApiSources,
  walkUpDirs,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = path.resolve(args[i + 1]);
      i += 1;
    }
  }

  const found = discoverOpenApiSources(cwd);
  process.stdout.write(`${JSON.stringify(found, null, 2)}\n`);
}
