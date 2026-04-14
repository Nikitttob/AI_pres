const fs = require("fs");
const os = require("os");
const path = require("path");

describe("bot/state", () => {
  let tmpDir;
  let statePath;
  let state;

  function loadFreshStateModule() {
    jest.resetModules();
    state = require("../bot/state");
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-state-test-"));
    statePath = path.join(tmpDir, "bot-state.json");
    process.env.BOT_STATE_PATH = statePath;
    loadFreshStateModule();
  });

  afterEach(() => {
    if (state && typeof state.flushState === "function") {
      state.flushState();
    }
    delete process.env.BOT_STATE_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("setMode/getMode работают корректно", () => {
    expect(state.getMode("1")).toBe(state.DEFAULT_MODE);
    state.setMode("1", "travel");
    expect(state.getMode("1")).toBe("travel");
  });

  test("addToHistory/getHistory работают корректно", () => {
    state.addToHistory("10", "user", "Привет");
    state.addToHistory("10", "assistant", "Здравствуйте");

    expect(state.getHistory("10")).toEqual([
      { role: "user", content: "Привет" },
      { role: "assistant", content: "Здравствуйте" },
    ]);
  });

  test("clearHistory обнуляет историю", () => {
    state.addToHistory("20", "user", "Q");
    expect(state.getHistory("20")).toHaveLength(1);

    state.clearHistory("20");
    expect(state.getHistory("20")).toEqual([]);
  });

  test("MAX_HISTORY соблюдается при переполнении", () => {
    const chatId = "30";
    const total = state.MAX_HISTORY + 5;

    for (let i = 0; i < total; i += 1) {
      state.addToHistory(chatId, "user", `msg-${i}`);
    }

    const history = state.getHistory(chatId);
    expect(history).toHaveLength(state.MAX_HISTORY);
    expect(history[0].content).toBe("msg-5");
    expect(history[history.length - 1].content).toBe(`msg-${total - 1}`);
  });

  test("состояние читается/пишется через файл", () => {
    state.setMode("77", "market");
    state.addToHistory("77", "user", "persist me");
    state.flushState();

    loadFreshStateModule();

    expect(state.getMode("77")).toBe("market");
    expect(state.getHistory("77")).toEqual([
      { role: "user", content: "persist me" },
    ]);
  });
});
