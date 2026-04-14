// ═══════════════════════════════════════════════
// Состояние пользователей Telegram-бота
// (режим + история диалога; поддерживается персистентность на диск)
// ═══════════════════════════════════════════════

const { loadState, saveState } = require("./statePersistence");

const MAX_HISTORY = 20;
const DEFAULT_MODE = "zhkh";
const SAVE_DEBOUNCE_MS = 5_000;

const persisted = loadState();
const userModes = persisted.modes || {};
const userHistory = persisted.history || {};

let saveTimer = null;
let saveScheduled = false;

function snapshotState() {
  return {
    modes: { ...userModes },
    history: Object.fromEntries(
      Object.entries(userHistory).map(([chatId, history]) => [chatId, [...history]])
    ),
  };
}

function flushState() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (!saveScheduled) return;

  saveState(snapshotState());
  saveScheduled = false;
}

function scheduleSave() {
  saveScheduled = true;
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushState();
  }, SAVE_DEBOUNCE_MS);

  saveTimer.unref?.();
}

function getMode(chatId) {
  return userModes[chatId] || DEFAULT_MODE;
}

function setMode(chatId, modeId) {
  userModes[chatId] = modeId;
  userHistory[chatId] = [];
  scheduleSave();
}

function getHistory(chatId) {
  if (!userHistory[chatId]) userHistory[chatId] = [];
  return userHistory[chatId];
}

function addToHistory(chatId, role, content) {
  const h = getHistory(chatId);
  h.push({ role, content: String(content).slice(0, 2000) });
  while (h.length > MAX_HISTORY) h.shift();
  scheduleSave();
}

function clearHistory(chatId) {
  userHistory[chatId] = [];
  scheduleSave();
}

module.exports = {
  MAX_HISTORY,
  DEFAULT_MODE,
  getMode,
  setMode,
  getHistory,
  addToHistory,
  clearHistory,
  flushState,
};
