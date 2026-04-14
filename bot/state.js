// ═══════════════════════════════════════════════
// Состояние пользователей Telegram-бота
// (режим + история диалога, хранятся в памяти процесса)
// ═══════════════════════════════════════════════

const MAX_HISTORY = 20;
const DEFAULT_MODE = "zhkh";

const userModes = {};
const userHistory = {};

function getMode(chatId) {
  return userModes[chatId] || DEFAULT_MODE;
}

function setMode(chatId, modeId) {
  userModes[chatId] = modeId;
  userHistory[chatId] = [];
}

function getHistory(chatId) {
  if (!userHistory[chatId]) userHistory[chatId] = [];
  return userHistory[chatId];
}

function addToHistory(chatId, role, content) {
  const h = getHistory(chatId);
  h.push({ role, content: String(content).slice(0, 2000) });
  while (h.length > MAX_HISTORY) h.shift();
}

function clearHistory(chatId) {
  userHistory[chatId] = [];
}

module.exports = {
  MAX_HISTORY,
  DEFAULT_MODE,
  getMode,
  setMode,
  getHistory,
  addToHistory,
  clearHistory,
};
