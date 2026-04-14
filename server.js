const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// ═══════════════════════════════════════════════
// Загрузка .env
// ═══════════════════════════════════════════════
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const eq = t.indexOf("=");
      if (eq > 0) {
        const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const app = express();

// За reverse-proxy (Railway/Nginx/etc.) доверяем первому прокси,
// чтобы req.ip корректно отражал IP клиента для rate-limiter.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ═══════════════════════════════════════════════
// Rate limiting для API-эндпоинтов
// ═══════════════════════════════════════════════
const { rateLimit } = require("./src/middleware/rateLimit");
const { validateBody } = require("./src/middleware/validate");
const { normalizeHistory } = require("./src/utils/messages");

// Общий лимит на все /api/* — защита от флуда
const apiLimiter = rateLimit({
  name: "api",
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_API_PER_MIN) || 60,
});

// Строгий лимит на LLM-запросы (дорогие операции)
const chatLimiter = rateLimit({
  name: "chat",
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN) || 15,
});

// Отдельный лимит на админские операции
const adminLimiter = rateLimit({
  name: "admin",
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_ADMIN_PER_MIN) || 10,
});

app.use("/api/", apiLimiter);

// Статика: ищем public/, затем корень
const publicDir = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public") : __dirname;
app.use(express.static(publicDir));

// ═══════════════════════════════════════════════
// Конфигурация режимов вынесена в /bot/modes.js
// ═══════════════════════════════════════════════
const { MODES } = require("./bot/modes");

// ═══════════════════════════════════════════════
// Загрузка баз знаний (RAG)
// ═══════════════════════════════════════════════
const knowledgeBases = {};

for (const [modeId, mode] of Object.entries(MODES)) {
  if (mode.type === "rag" && mode.kbFile) {
    const paths = [
      path.join(__dirname, "data", mode.kbFile),
      path.join(__dirname, mode.kbFile),
    ];
    const kbPath = paths.find(p => fs.existsSync(p));
    if (kbPath) {
      knowledgeBases[modeId] = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
      console.log(`📚 ${mode.name}: ${knowledgeBases[modeId].length} вопросов загружено`);
    } else {
      console.log(`⚠️  ${mode.name}: файл ${mode.kbFile} не найден`);
      knowledgeBases[modeId] = [];
    }
  }
}

// ═══════════════════════════════════════════════
// Поисковый движок (реализация — /src/rag/search.js)
// ═══════════════════════════════════════════════
const { search: searchKB } = require("./src/rag/search");

function search(modeId, query, subMode = "all", topN = 5) {
  return searchKB(knowledgeBases[modeId] || [], query, subMode, topN);
}

// ═══════════════════════════════════════════════
// LLM-провайдеры (Claude + Ollama с fallback)
// ═══════════════════════════════════════════════
const { getLLMManager } = require("./src/llm");
const llm = getLLMManager();

// Обёртка для обратной совместимости: возвращает только текст ответа
async function callLLM(systemPrompt, messages) {
  const { answer } = await llm.generateResponse(messages, {
    systemPrompt,
    maxTokens: 2000,
  });
  return answer;
}

// ═══════════════════════════════════════════════
// API: Список режимов
// ═══════════════════════════════════════════════
app.get("/api/modes", async (req, res) => {
  const modes = Object.values(MODES).map(m => ({
    id: m.id, name: m.name, icon: m.icon,
    description: m.description, type: m.type,
    examples: m.examples, subModes: m.subModes,
    kbSize: (knowledgeBases[m.id] || []).length
  }));
  const providers = await llm.status();
  // hasApiKey сохранён для обратной совместимости: true, если есть
  // любой доступный LLM-провайдер.
  const hasApiKey = Object.entries(providers)
    .filter(([k]) => k !== "primary")
    .some(([, v]) => v === true);
  res.json({ modes, providers, hasApiKey });
});

// ═══════════════════════════════════════════════
// API: LLM-провайдеры (статус + переключение primary)
// ═══════════════════════════════════════════════
app.get("/api/llm/providers", async (req, res) => {
  const status = await llm.status();
  res.json({ ...status, available: Object.keys(llm.providers) });
});

app.post("/api/llm/primary", adminLimiter, async (req, res) => {
  const { name } = req.body || {};
  try {
    const newPrimary = llm.setPrimary(name);
    const status = await llm.status();
    console.log(`[LLM] Primary переключён → ${newPrimary}`);
    res.json({ ok: true, primary: newPrimary, providers: status });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════
// API: Чат (универсальный для всех режимов)
// ═══════════════════════════════════════════════
app.post("/api/chat", chatLimiter, validateBody({
  message: { type: "string", required: true, min: 1 },
  modeId: { type: "string" },
  subMode: { type: "string" },
  history: { type: "array" },
}), async (req, res) => {
  const { message, modeId, subMode, history } = req.body;

  const mode = MODES[modeId] || MODES.zhkh;
  let context = [];
  let contextBlock = "";

  // RAG: поиск контекста
  if (mode.type === "rag") {
    context = search(modeId, message, subMode || "all");
    contextBlock = context.length > 0
      ? "КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:\n\n" + context.map((c, i) =>
          `[${i + 1}] Вопрос: ${c.q}\nОтвет: ${c.a}\nИсточник: ${c.r}`
        ).join("\n\n")
      : "В базе знаний не найдено релевантного контекста.";
  }

  // Формирование сообщений
  const messages = normalizeHistory(history, 12);

  const userContent = mode.type === "rag"
    ? `${contextBlock}\n\n---\nВОПРОС: ${message}`
    : message;
  messages.push({ role: "user", content: userContent });

  // Вызов Claude
  const answer = await callLLM(mode.systemPrompt, messages);

  if (answer) {
    res.json({ answer, sources: context, offline: false });
  } else {
    // Оффлайн — ни один LLM-провайдер недоступен
    const hint = "Настройте ANTHROPIC_API_KEY, GIGACHAT_CREDENTIALS или запустите Ollama (OLLAMA_HOST, OLLAMA_MODEL).";
    let offlineAnswer;
    if (mode.type === "rag" && context.length > 0) {
      offlineAnswer = "📋 **Результаты из базы знаний:**\n\n" +
        context.map(c => `**${c.q}**\n${c.a}\n📌 _${c.r}_`).join("\n\n") +
        `\n\n---\n_⚡ Оффлайн-режим: нет доступных LLM-провайдеров. ${hint}_`;
    } else if (mode.type === "rag") {
      offlineAnswer = `В базе знаний не найдено релевантной информации, а LLM-провайдеры недоступны. ${hint}`;
    } else {
      offlineAnswer = `⚠️ Режим «${mode.name}» требует LLM-провайдера. ${hint}`;
    }
    res.json({ answer: offlineAnswer, sources: context, offline: true });
  }
});

// ═══════════════════════════════════════════════
// API: Поиск по базе знаний
// ═══════════════════════════════════════════════
app.post("/api/search", chatLimiter, validateBody({
  query: { type: "string" },
  modeId: { type: "string" },
  subMode: { type: "string" },
}), (req, res) => {
  const { query, modeId, subMode } = req.body;
  res.json({ results: search(modeId || "zhkh", query || "", subMode || "all") });
});

// ═══════════════════════════════════════════════
// API: Health check
// ═══════════════════════════════════════════════
app.get("/health", async (req, res) => {
  const kbStats = {};
  for (const [k, v] of Object.entries(knowledgeBases)) kbStats[k] = v.length;
  const providers = await llm.status();
  res.json({
    status: "ok",
    modes: Object.keys(MODES).length,
    kb: kbStats,
    providers,
    uptime: process.uptime(),
  });
});

// ═══════════════════════════════════════════════
// API: Панель управления базой знаний (/api/knowledge)
// ═══════════════════════════════════════════════
const { createKnowledgeRouter } = require("./src/routes/knowledge");
app.use(
  "/api/knowledge",
  createKnowledgeRouter({
    knowledgeBases,
    MODES,
    llm,
    rootDir: __dirname,
    adminLimiter,
  })
);

// Отдаём страницу админки. Ищем сначала public/, затем корень.
app.get("/admin", (req, res) => {
  const candidates = [
    path.join(__dirname, "public", "admin.html"),
    path.join(__dirname, "admin.html"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (file) return res.sendFile(file);
  res.status(404).send("admin.html не найден");
});

// ═══════════════════════════════════════════════
// TELEGRAM BOT — модульная архитектура (/bot)
// ═══════════════════════════════════════════════
let telegramShutdown = null;

if (process.env.TELEGRAM_BOT_TOKEN) {
  const { startBot } = require("./bot");
  const { shutdown } = startBot({
    token: process.env.TELEGRAM_BOT_TOKEN,
    search,
    callLLM,
  });
  telegramShutdown = shutdown;
} else {
  console.log("ℹ️  Telegram-бот не запущен (нет TELEGRAM_BOT_TOKEN)");
}

// ═══════════════════════════════════════════════
// SPA fallback
// ═══════════════════════════════════════════════
const indexPath = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public", "index.html")
  : path.join(__dirname, "index.html");
app.get("*", (req, res) => res.sendFile(indexPath));

// ═══════════════════════════════════════════════
// Запуск
// ═══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
const httpServer = app.listen(PORT, async () => {
  const status = await llm.status();
  const claudeIcon = status.claude ? "✅" : "❌";
  const ollamaIcon = status.ollama ? "✅" : "❌";
  const gigaIcon = status.gigachat ? "✅" : "❌";
  const tgIcon = process.env.TELEGRAM_BOT_TOKEN ? "✅" : "❌";
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  🚀 AI Мультиассистент v2.0 запущен!         ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  🌐 http://localhost:${PORT}                     ║`);
  console.log(`║  📚 Режимов: ${Object.keys(MODES).length}                              ║`);
  console.log(`║  🔑 Claude: ${claudeIcon}  🦙 Ollama: ${ollamaIcon}  🟢 GigaChat: ${gigaIcon}  TG: ${tgIcon}  ║`);
  console.log(`║  🎯 LLM primary: ${status.primary.padEnd(28)}║`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
});

// ═══════════════════════════════════════════════
// Graceful shutdown (SIGINT/SIGTERM)
// ═══════════════════════════════════════════════
let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) {
    console.log(`\n⛔ Повторный ${signal} — принудительный выход`);
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`\n📴 Получен ${signal}, начинаем корректное завершение…`);

  // Hard-timeout на случай, если что-то повиснет
  const killTimer = setTimeout(() => {
    console.error("⏱️  Таймаут graceful shutdown (10s) — force exit");
    process.exit(1);
  }, 10_000);
  killTimer.unref?.();

  try {
    if (telegramShutdown) await telegramShutdown();
  } catch (err) {
    console.error("⚠️  Ошибка остановки Telegram-бота:", err?.message || err);
  }

  httpServer.close((err) => {
    if (err) {
      console.error("⚠️  Ошибка закрытия HTTP-сервера:", err.message);
      process.exit(1);
    }
    console.log("👋 HTTP-сервер остановлен, выход");
    process.exit(0);
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
