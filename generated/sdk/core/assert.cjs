function requireEnv(keys) {
  const missing = (keys || []).filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

function redactSecrets(input) {
  const text = String(input ?? "");
  return text
    .replace(/(client_secret|app_secret|token|signature|secret)(\\?["']?\\s*[:=]\\s*\\?["']?)([^"\\s&]+)/gi, "$1$2***")
    .replace(/(app-token=)[^&\\s]+/gi, "$1***")
    .replace(/(access_token=)[^&\\s]+/gi, "$1***");
}

function safeLog(prefix, payload) {
  const p = prefix ? String(prefix) : "[LOG]";
  if (payload === undefined) {
    console.log(p);
    return;
  }
  try {
    console.log(`${p} ${redactSecrets(JSON.stringify(payload))}`);
  } catch {
    console.log(`${p} ${redactSecrets(String(payload))}`);
  }
}

module.exports = { requireEnv, redactSecrets, safeLog };
