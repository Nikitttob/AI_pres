const fs = require("fs");

function parseEnvContent(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const eq = t.indexOf("=");
      if (eq > 0) {
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim();
        vars[k] = v;
      }
    }
  }
  return vars;
}

function loadEnvFile(envPath, env = process.env) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const vars = parseEnvContent(content);
  for (const [k, v] of Object.entries(vars)) {
    if (!env[k]) env[k] = v;
  }
  return vars;
}

module.exports = { parseEnvContent, loadEnvFile };
