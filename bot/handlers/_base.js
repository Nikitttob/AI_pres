// ═══════════════════════════════════════════════
// Базовая фабрика хендлера для RAG-режимов.
// Каждый per-mode модуль конфигурирует её под свой режим.
// ═══════════════════════════════════════════════
const { afterAnswerKeyboard, modeKeyboard } = require("../keyboards");
const { getHistory, addToHistory } = require("../state");
const { logResponse } = require("../middleware/logger");
const { logRequest } = require("../../src/analytics/logger");

/**
 * @typedef {Object} HandlerDeps
 * @property {import('node-telegram-bot-api')} bot
 * @property {(modeId:string, query:string, subMode?:string)=>Array} search
 * @property {(systemPrompt:string, messages:Array)=>Promise<string|null>} callLLM
 */

/**
 * @param {object} modeConfig
 * @param {HandlerDeps} deps
 * @returns {(chatId:number, text:string)=>Promise<void>}
 */
function createRagHandler(modeConfig, deps) {
  const { bot, search, callLLM } = deps;
  const modeId = modeConfig.id;

  async function sendWithFallback(chatId, text, opts = {}) {
    try {
      return await bot.sendMessage(chatId, text, opts);
    } catch (err) {
      // Markdown-парсер может упасть на экзотике — повторяем без parse_mode.
      const fallbackOpts = { ...opts };
      delete fallbackOpts.parse_mode;
      try {
        return await bot.sendMessage(chatId, text, fallbackOpts);
      } catch (err2) {
        console.error(`[TG] send failed chat=${chatId}:`, err2?.message || err2);
      }
    }
  }

  return async function handle(chatId, text) {
    const startedAt = Date.now();

    try {
      await bot.sendChatAction(chatId, "typing").catch(() => {});
    } catch (_) { /* ignore */ }

    addToHistory(chatId, "user", text);

    // RAG-контекст
    let context = [];
    let contextBlock = "";
    if (modeConfig.type === "rag") {
      try {
        context = search(modeId, text, "all") || [];
      } catch (err) {
        console.error(`[TG] search(${modeId}) failed:`, err?.message || err);
        context = [];
      }
      if (context.length > 0) {
        contextBlock = "КОНТЕКСТ:\n\n" + context
          .map((c, i) => `[${i + 1}] ${c.q}\n${c.a}\nИсточник: ${c.r}`)
          .join("\n\n");
      }
    }

    // Сборка сообщений для LLM
    const history = getHistory(chatId);
    const apiMessages = history
      .slice(0, -1)
      .slice(-10)
      .map(h => ({ role: h.role, content: h.content }));

    const userContent = contextBlock
      ? `${contextBlock}\n\n---\nВОПРОС: ${text}`
      : text;
    apiMessages.push({ role: "user", content: userContent });

    // Вызов LLM с защитой от сбоев
    let answer = null;
    let llmError = null;
    try {
      answer = await callLLM(modeConfig.systemPrompt, apiMessages);
    } catch (err) {
      llmError = err;
      console.error(`[TG] LLM call failed (${modeId}):`, err?.message || err);
    }

    // Успех
    if (answer) {
      addToHistory(chatId, "assistant", answer);
      const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const opts = { parse_mode: "Markdown" };
        if (isLast) opts.reply_markup = afterAnswerKeyboard();
        await sendWithFallback(chatId, chunks[i], opts);
      }
      if (context.length > 0) {
        const sources = "📎 " + context.map(c => c.r).join(" | ");
        if (sources.length < 4000) await sendWithFallback(chatId, sources);
      }
      logResponse(chatId, modeId, startedAt, { ok: true, offline: false });
      logRequest({
        modeId,
        provider: "unknown",
        latencyMs: Date.now() - startedAt,
        offline: false,
        success: true,
        source: "telegram",
      });
      return;
    }

    // Оффлайн-ответ из базы знаний
    if (modeConfig.type === "rag" && context.length > 0) {
      let reply = "📋 Из базы знаний:\n\n";
      for (const c of context.slice(0, 3)) {
        reply += `❓ ${c.q}\n📝 ${String(c.a).slice(0, 300)}...\n📌 ${c.r}\n\n`;
      }
      reply += llmError ? "⚡ LLM временно недоступен" : "⚡ Оффлайн-режим";
      addToHistory(chatId, "assistant", reply);
      await sendWithFallback(chatId, reply, { reply_markup: afterAnswerKeyboard() });
      logResponse(chatId, modeId, startedAt, { ok: true, offline: true, error: llmError });
      logRequest({
        modeId,
        provider: "none",
        latencyMs: Date.now() - startedAt,
        offline: true,
        success: true,
        source: "telegram",
      });
      return;
    }

    // Полный оффлайн
    await sendWithFallback(
      chatId,
      `⚠️ Режим «${modeConfig.name}»: нет доступных LLM-провайдеров. ` +
        "Настройте ANTHROPIC_API_KEY, GIGACHAT_CREDENTIALS или запустите Ollama (OLLAMA_HOST, OLLAMA_MODEL).",
      { reply_markup: modeKeyboard() }
    );
    logResponse(chatId, modeId, startedAt, { ok: false, offline: true, error: llmError });
    logRequest({
      modeId,
      provider: "none",
      latencyMs: Date.now() - startedAt,
      offline: true,
      success: false,
      source: "telegram",
    });
  };
}

module.exports = { createRagHandler };
