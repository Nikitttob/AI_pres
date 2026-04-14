// ═══════════════════════════════════════════════
// Middleware обработки ошибок
// Главная цель — бот не должен падать при ошибке API или хендлера.
// ═══════════════════════════════════════════════

function ts() {
  return new Date().toISOString();
}

/**
 * Оборачивает async-обработчик Telegram-события в try/catch.
 * При ошибке логирует и шлёт пользователю понятное сообщение.
 *
 * @param {import('node-telegram-bot-api')} bot
 * @param {Function} fn   — async (...args) => any
 * @param {string}   name — имя обработчика для логов
 */
function wrap(bot, fn, name = "handler") {
  return async function (...args) {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[TG ${ts()}] ❌ ${name} failed:`, err && err.stack ? err.stack : err);

      // Попробуем вытащить chatId из первого аргумента (message или callback_query)
      const maybe = args[0];
      const chatId =
        maybe?.chat?.id ??
        maybe?.message?.chat?.id ??
        null;

      if (chatId) {
        try {
          await bot.sendMessage(
            chatId,
            "⚠️ Произошла внутренняя ошибка. Попробуйте ещё раз через минуту или /start."
          );
        } catch (sendErr) {
          console.error(`[TG ${ts()}] ⚠️ не удалось уведомить пользователя:`, sendErr?.message || sendErr);
        }
      }
    }
  };
}

/**
 * Подписывает бот на ошибки polling/webhook и process-level отказы,
 * чтобы неперехваченные исключения не убивали процесс.
 */
function attachGlobalErrorHandlers(bot) {
  bot.on("polling_error", (err) => {
    console.error(`[TG ${ts()}] polling_error:`, err?.message || err);
  });

  bot.on("webhook_error", (err) => {
    console.error(`[TG ${ts()}] webhook_error:`, err?.message || err);
  });

  bot.on("error", (err) => {
    console.error(`[TG ${ts()}] bot error:`, err?.message || err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`[${ts()}] unhandledRejection:`, reason);
  });

  process.on("uncaughtException", (err) => {
    console.error(`[${ts()}] uncaughtException:`, err?.stack || err);
  });
}

module.exports = { wrap, attachGlobalErrorHandlers };
