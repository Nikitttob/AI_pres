// ═══════════════════════════════════════════════
// Точка входа Telegram-бота.
// Собирает middleware, регистрирует хендлеры режимов и команды,
// возвращает объект с методом graceful-остановки.
// ═══════════════════════════════════════════════
const TelegramBot = require("node-telegram-bot-api");

const { MODES } = require("./modes");
const { buildHandlers } = require("./handlers");
const {
  modeKeyboard,
  examplesKeyboard,
  afterAnswerKeyboard,
} = require("./keyboards");
const {
  getMode,
  setMode,
  getHistory,
  clearHistory,
  MAX_HISTORY,
  DEFAULT_MODE,
} = require("./state");
const { attachLogger } = require("./middleware/logger");
const { wrap, attachGlobalErrorHandlers } = require("./middleware/errorHandler");

/**
 * @param {object} opts
 * @param {string} opts.token — TELEGRAM_BOT_TOKEN
 * @param {(modeId:string, query:string, subMode?:string)=>Array} opts.search
 * @param {(systemPrompt:string, messages:Array)=>Promise<string|null>} opts.callLLM
 * @returns {{ bot: TelegramBot, shutdown: ()=>Promise<void> }}
 */
function startBot({ token, search, callLLM }) {
  if (!token) throw new Error("startBot: требуется TELEGRAM_BOT_TOKEN");

  const bot = new TelegramBot(token, { polling: true });

  // 1) Middleware: логирование + глобальные обработчики ошибок
  attachLogger(bot);
  attachGlobalErrorHandlers(bot);

  // 2) Инстанцируем per-mode хендлеры
  const handlers = buildHandlers({ bot, search, callLLM });

  function dispatch(chatId, text) {
    const modeId = getMode(chatId);
    const handler = handlers[modeId] || handlers[DEFAULT_MODE];
    return handler(chatId, text);
  }

  // 3) Приветствие режима
  async function sendModeGreeting(chatId, modeId) {
    const mode = MODES[modeId];
    await bot.sendMessage(
      chatId,
      `${mode.icon} *Режим: ${mode.name}*\n\n${mode.description}\n\n🧠 Память включена — помню контекст диалога\n\nЗадайте вопрос или выберите пример:`,
      { parse_mode: "Markdown", reply_markup: examplesKeyboard(modeId) }
    );
  }

  // 4) Команды
  bot.onText(/\/start/, wrap(bot, async (msg) => {
    setMode(msg.chat.id, DEFAULT_MODE);
    await bot.sendMessage(
      msg.chat.id,
      "🚀 *AI Мультиассистент*\n\n5 режимов работы с базами знаний и Claude AI.\nВыберите режим:",
      { parse_mode: "Markdown", reply_markup: modeKeyboard() }
    );
  }, "/start"));

  bot.onText(/\/mode$/, wrap(bot, async (msg) => {
    await bot.sendMessage(msg.chat.id, "🔄 Выберите режим:", {
      reply_markup: modeKeyboard(),
    });
  }, "/mode"));

  bot.onText(/\/clear/, wrap(bot, async (msg) => {
    clearHistory(msg.chat.id);
    await bot.sendMessage(msg.chat.id, "🧹 История очищена!");
  }, "/clear"));

  bot.onText(/\/help/, wrap(bot, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "📋 *Команды:*\n\n" +
        "/start — Начало\n" +
        "/mode — Выбор режима\n" +
        "/clear — Очистить историю\n" +
        "/help — Справка\n\n" +
        "Или просто напишите вопрос!",
      { parse_mode: "Markdown" }
    );
  }, "/help"));

  // /mode_<id> — текстовое переключение для совместимости
  for (const mode of Object.values(MODES)) {
    bot.onText(new RegExp(`/mode_${mode.id}\\b`), wrap(bot, async (msg) => {
      setMode(msg.chat.id, mode.id);
      await sendModeGreeting(msg.chat.id, mode.id);
    }, `/mode_${mode.id}`));
  }

  // 5) Нажатия на inline-кнопки
  bot.on("callback_query", wrap(bot, async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data || "";

    bot.answerCallbackQuery(query.id).catch(() => {});

    if (data.startsWith("mode:")) {
      const modeId = data.split(":")[1];
      if (MODES[modeId]) {
        setMode(chatId, modeId);
        await sendModeGreeting(chatId, modeId);
      }
      return;
    }

    if (data === "action:modes") {
      await bot.sendMessage(chatId, "🔄 Выберите режим:", {
        reply_markup: modeKeyboard(),
      });
      return;
    }

    if (data === "action:clear") {
      clearHistory(chatId);
      await bot.sendMessage(chatId, "🧹 История очищена. Начинаем с чистого листа!");
      return;
    }

    if (data === "action:examples") {
      const modeId = getMode(chatId);
      const mode = MODES[modeId];
      await bot.sendMessage(
        chatId,
        `💡 Примеры для режима ${mode.icon} *${mode.name}*:`,
        { parse_mode: "Markdown", reply_markup: examplesKeyboard(modeId) }
      );
      return;
    }

    if (data === "action:memory") {
      const h = getHistory(chatId);
      const modeId = getMode(chatId);
      const mode = MODES[modeId];
      await bot.sendMessage(
        chatId,
        `🧠 *Память*\n\nРежим: ${mode.icon} ${mode.name}\nСообщений: ${h.length}/${MAX_HISTORY}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data.startsWith("ask:")) {
      const question = data.slice(4);
      await dispatch(chatId, question);
    }
  }, "callback_query"));

  // 6) Обычные сообщения
  bot.on("message", wrap(bot, async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    await dispatch(msg.chat.id, msg.text);
  }, "message"));

  console.log("🤖 Telegram-бот запущен (модульная архитектура, middleware, graceful shutdown)");

  // 7) Graceful shutdown
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    console.log("🛑 Остановка Telegram-бота…");
    try {
      if (typeof bot.stopPolling === "function") {
        await bot.stopPolling({ cancel: true });
      }
      if (typeof bot.closeWebHook === "function") {
        await bot.closeWebHook().catch(() => {});
      }
      console.log("✅ Telegram-бот остановлен");
    } catch (err) {
      console.error("⚠️  Ошибка при остановке бота:", err?.message || err);
    }
  }

  return { bot, shutdown };
}

module.exports = { startBot };
