function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;

  const role = item.role === "assistant" ? "assistant" : "user";
  const raw = typeof item.content === "string"
    ? item.content
    : typeof item.text === "string"
      ? item.text
      : "";

  if (!raw.trim()) return null;
  return { role, content: raw };
}

function normalizeHistory(history, limit = 12) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-limit)
    .map(normalizeHistoryItem)
    .filter(Boolean);
}

module.exports = { normalizeHistoryItem, normalizeHistory };
