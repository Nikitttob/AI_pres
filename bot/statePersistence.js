const fs = require("fs");
const path = require("path");

const DEFAULT_STATE_PATH = "./data/bot-state.json";

function getStateFilePath() {
  return process.env.BOT_STATE_PATH || DEFAULT_STATE_PATH;
}

function ensureStateDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  const filePath = getStateFilePath();

  try {
    if (!fs.existsSync(filePath)) {
      return { modes: {}, history: {} };
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    return {
      modes: parsed && typeof parsed.modes === "object" ? parsed.modes : {},
      history: parsed && typeof parsed.history === "object" ? parsed.history : {},
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.warn(`⚠️  BOT state JSON is invalid (${filePath}), using empty state`);
      return { modes: {}, history: {} };
    }
    throw err;
  }
}

function saveState({ modes, history }) {
  const filePath = getStateFilePath();
  ensureStateDir(filePath);
  const payload = JSON.stringify({ modes, history }, null, 2);
  fs.writeFileSync(filePath, payload, "utf-8");
}

module.exports = {
  getStateFilePath,
  loadState,
  saveState,
};
