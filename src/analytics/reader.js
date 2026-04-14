const fs = require("fs");
const { LOG_PATH } = require("./logger");

function dateKey(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function getCutoff(days) {
  const safeDays = Number.isFinite(Number(days)) ? Math.max(1, Math.floor(Number(days))) : 7;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (safeDays - 1));
  return { safeDays, start };
}

function getStats(days = 7) {
  const { safeDays, start } = getCutoff(days);

  const stats = {
    totalRequests: 0,
    requestsByMode: {},
    requestsByProvider: {},
    requestsBySource: {},
    avgLatencyMs: 0,
    offlineRate: 0,
    successRate: 0,
    requestsByDay: [],
  };

  const dayMap = new Map();
  const now = new Date();
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }

  if (!fs.existsSync(LOG_PATH)) {
    stats.requestsByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
    return stats;
  }

  const raw = fs.readFileSync(LOG_PATH, "utf-8");
  const lines = raw.split("\n");

  let sumLatency = 0;
  let offlineCount = 0;
  let successCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch (_) {
      continue;
    }

    const ts = new Date(rec.timestamp);
    if (Number.isNaN(ts.getTime()) || ts < start) continue;

    stats.totalRequests += 1;

    const modeId = String(rec.modeId || "unknown");
    const provider = String(rec.provider || "unknown");
    const source = String(rec.source || "web");

    stats.requestsByMode[modeId] = (stats.requestsByMode[modeId] || 0) + 1;
    stats.requestsByProvider[provider] = (stats.requestsByProvider[provider] || 0) + 1;
    stats.requestsBySource[source] = (stats.requestsBySource[source] || 0) + 1;

    const latency = Number(rec.latencyMs);
    if (Number.isFinite(latency)) sumLatency += latency;
    if (rec.offline) offlineCount += 1;
    if (rec.success) successCount += 1;

    const dk = dateKey(rec.timestamp);
    if (dk && dayMap.has(dk)) dayMap.set(dk, dayMap.get(dk) + 1);
  }

  if (stats.totalRequests > 0) {
    stats.avgLatencyMs = Number((sumLatency / stats.totalRequests).toFixed(2));
    stats.offlineRate = Number(((offlineCount / stats.totalRequests) * 100).toFixed(2));
    stats.successRate = Number(((successCount / stats.totalRequests) * 100).toFixed(2));
  }

  stats.requestsByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
  return stats;
}

module.exports = { getStats };
