// ═══════════════════════════════════════════════
// Middleware для логирования входящих событий
// ═══════════════════════════════════════════════

function ts() {
  return new Date().toISOString();
}

function short(text, n = 80) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/**
 * Подписывает бота на логирование входящих сообщений и callback-запросов.
 * Не вмешивается в последующую обработку.
 *
 * @param {import('node-telegram-bot-api')} bot
 */
function attachLogger(bot) {
  bot.on("message", (msg) => {
    const who = msg.from ? `${msg.from.id}${msg.from.username ? "/@" + msg.from.username : ""}` : "?";
    console.log(`[TG ${ts()}] msg  chat=${msg.chat.id} user=${who} text="${short(msg.text || "")}"`);
  });

  bot.on("callback_query", (q) => {
    const who = q.from ? `${q.from.id}${q.from.username ? "/@" + q.from.username : ""}` : "?";
    console.log(`[TG ${ts()}] cb   chat=${q.message?.chat?.id} user=${who} data="${q.data}"`);
  });
}

/**
 * Лог ответа на запрос пользователя (вызывается вручную из хендлеров).
 */
function logResponse(chatId, modeId, startedAt, { ok, offline = false, error = null } = {}) {
  const ms = Date.now() - startedAt;
  const status = error ? `ERR(${error.message || error})` : (ok ? (offline ? "offline" : "ok") : "empty");
  console.log(`[TG ${ts()}] resp chat=${chatId} mode=${modeId} ${ms}ms ${status}`);
}

module.exports = { attachLogger, logResponse };
