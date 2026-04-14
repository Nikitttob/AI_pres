const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const LOG_PATH = path.join(DATA_DIR, "analytics.jsonl");
const BAK_PATH = path.join(DATA_DIR, "analytics.jsonl.bak");
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function rotateIfNeeded() {
  if (!fs.existsSync(LOG_PATH)) return;
  const stats = fs.statSync(LOG_PATH);
  if (stats.size <= MAX_SIZE_BYTES) return;

  try {
    if (fs.existsSync(BAK_PATH)) fs.unlinkSync(BAK_PATH);
  } catch (_) {
    // ignore
  }
  fs.renameSync(LOG_PATH, BAK_PATH);
}

function normalizeSource(source) {
  return ["web", "telegram", "admin"].includes(source) ? source : "web";
}

function logRequest({ modeId, provider, latencyMs, offline, success, source }) {
  try {
    ensureDir();
    rotateIfNeeded();

    const record = {
      timestamp: new Date().toISOString(),
      modeId: String(modeId || "unknown"),
      provider: String(provider || "unknown"),
      latencyMs: Number.isFinite(Number(latencyMs)) ? Math.max(0, Math.round(Number(latencyMs))) : 0,
      offline: Boolean(offline),
      success: Boolean(success),
      source: normalizeSource(source),
    };

    fs.appendFileSync(LOG_PATH, JSON.stringify(record) + "\n", "utf-8");
  } catch (err) {
    console.error("[analytics] logRequest failed:", err?.message || err);
  }
}

module.exports = { logRequest, LOG_PATH, BAK_PATH };
