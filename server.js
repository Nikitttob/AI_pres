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
app.use(cors());
app.use(express.json());

// Статика: ищем public/, затем корень
const publicDir = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public") : __dirname;
app.use(express.static(publicDir));

// ═══════════════════════════════════════════════
// 5 РЕЖИМОВ АССИСТЕНТА
// ═══════════════════════════════════════════════
const MODES = {
  zhkh: {
    id: "zhkh",
    name: "ЖКХ и Право",
    icon: "⚖️",
    description: "Правовая система РФ, ЖКХ, банковское обслуживание фондов капремонта",
    type: "rag", // RAG с базой знаний
    kbFile: "kb_zhkh.json",
    systemPrompt: `Ты — профессиональный AI-ассистент по правовой системе РФ, ЖКХ и банковскому обслуживанию фондов капитального ремонта. Сейчас ты работаешь в режиме «ЖКХ и Право», но ты также умеешь помогать по другим темам: Экономика, Путешествия, Анализ рынка, Презентации — для этого пользователю нужно переключить режим.

ПРАВИЛА:
- Отвечай на русском языке, структурированно и по существу
- Используй контекст из базы знаний, ссылайся на конкретные статьи и нормативные акты
- Если контекст не покрывает вопрос — дополни своими знаниями с пометкой «Дополнительно:»
- Если вопрос не по теме текущего режима — ответь по существу, но предложи переключить режим для более точного ответа
- Не повторяй вопрос пользователя`,
    examples: [
      "Какие банки могут вести спецсчета капремонта?",
      "Как согласовать перепланировку?",
      "Права собственника жилого помещения"
    ],
    subModes: [
      { id: "all", label: "Все", desc: "" },
      { id: "l", label: "Право и ЖКХ", desc: "" },
      { id: "b", label: "Банки и капремонт", desc: "" }
    ]
  },
  economics: {
    id: "economics",
    name: "Экономика",
    icon: "📊",
    description: "Макроэкономика, финансы, инвестиции, экономическая теория",
    type: "rag",
    kbFile: "kb_economics.json",
    systemPrompt: `Ты — экономический AI-аналитик и консультант. Сейчас ты в режиме «Экономика». Специализируешься на макроэкономике, финансовых рынках, инвестициях, экономической теории и бизнес-анализе. У тебя также есть режимы: ЖКХ и Право, Путешествия, Анализ рынка, Презентации.

ПРАВИЛА:
- Отвечай на русском языке с использованием экономической терминологии
- Опирайся на предоставленный контекст из базы знаний
- Приводи формулы, показатели, примеры расчётов где уместно
- При обсуждении инвестиций указывай на риски
- Ссылайся на экономические теории и авторов
- Если вопрос не по теме — ответь по существу, но предложи переключить режим командой /mode_X`,
    examples: [
      "Что такое ВВП и как он рассчитывается?",
      "Объясни денежно-кредитную политику ЦБ",
      "Как инфляция влияет на процентные ставки?"
    ],
    subModes: []
  },
  travel: {
    id: "travel",
    name: "Путешествия",
    icon: "✈️",
    description: "Планирование поездок, маршруты, бюджет, визы, достопримечательности",
    type: "rag",
    kbFile: "kb_travel.json",
    systemPrompt: `Ты — опытный тревел-консультант и планировщик путешествий. Сейчас ты в режиме «Путешествия». Помогаешь с планированием поездок, подбором маршрутов, оценкой бюджета, информацией о визах и достопримечательностях. У тебя также есть режимы: ЖКХ и Право, Экономика, Анализ рынка, Презентации.

ПРАВИЛА:
- Отвечай на русском языке
- Структурируй маршруты по дням с указанием времени и расстояний
- Указывай примерный бюджет в рублях и местной валюте
- Учитывай сезонность, визовые требования, особенности культуры
- Предлагай варианты: бюджетный, средний, премиум
- Предупреждай о возможных рисках и сложностях (безопасность, здоровье)
- Рекомендуй конкретные места, рестораны, отели с указанием ценового диапазона
- Если вопрос не по теме — ответь по существу, но предложи переключить режим командой /mode_X`,
    examples: [
      "Спланируй неделю в Стамбуле на двоих",
      "Куда поехать в мае на 5 дней, бюджет 100К",
      "Маршрут по Золотому кольцу на автомобиле"
    ],
    subModes: []
  },
  market: {
    id: "market",
    name: "Анализ рынка",
    icon: "📈",
    description: "Анализ рынков, конкурентов, SWOT, бизнес-модели, тренды",
    type: "rag",
    kbFile: "kb_market.json",
    systemPrompt: `Ты — аналитик рынков и бизнес-стратег. Сейчас ты в режиме «Анализ рынка». Помогаешь с анализом рынков, оценкой конкурентной среды, разработкой бизнес-моделей и выявлением трендов. У тебя также есть режимы: ЖКХ и Право, Экономика, Путешествия, Презентации.

ПРАВИЛА:
- Отвечай на русском языке
- Используй профессиональные фреймворки: SWOT, PEST, Porter's 5 Forces, TAM/SAM/SOM, Business Model Canvas
- Структурируй анализ: текущее состояние → тренды → возможности → риски → рекомендации
- Приводи данные и цифры где возможно
- Указывай источники данных и степень достоверности оценок
- При отсутствии точных данных давай обоснованные оценки с диапазонами
- Если вопрос не по теме — ответь по существу, но предложи переключить режим командой /mode_X`,
    examples: [
      "SWOT-анализ рынка доставки еды в РФ",
      "Основные тренды fintech 2025-2026",
      "Анализ конкурентов в сфере EdTech"
    ],
    subModes: []
  },
  presentation: {
    id: "presentation",
    name: "Презентации",
    icon: "🎯",
    description: "Структура презентаций, питч-деки, контент для слайдов, спикер-ноты",
    type: "rag",
    kbFile: "kb_presentation.json",
    systemPrompt: `Ты — эксперт по подготовке презентаций и публичных выступлений. Сейчас ты в режиме «Презентации». Помогаешь создавать структуры презентаций, питч-деки, контент для слайдов и спикер-ноты. У тебя также есть режимы: ЖКХ и Право, Экономика, Путешествия, Анализ рынка.

ПРАВИЛА:
- Отвечай на русском языке
- Структурируй слайды: номер → заголовок → ключевые тезисы → визуальные элементы → спикер-ноты
- Используй принцип «один слайд — одна идея»
- Рекомендуй визуализации: графики, диаграммы, иконки
- Адаптируй стиль под аудиторию (инвесторы, руководство, клиенты, команда)
- Следуй правилу 10-20-30 (10 слайдов, 20 минут, 30 шрифт) для питчей
- Предлагай цепляющие заголовки и opening hooks
- Если вопрос не по теме — ответь по существу, но предложи переключить режим командой /mode_X`,
    examples: [
      "Структура питч-дека для стартапа на 10 слайдов",
      "Презентация квартальных результатов для руководства",
      "Контент для слайдов о внедрении AI в компании"
    ],
    subModes: []
  }
};

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
// Поисковый движок
// ═══════════════════════════════════════════════
const STOP_WORDS = new Set([
  "и","в","на","по","с","к","о","из","за","от","для","не","что","как",
  "это","то","при","или","но","а","его","её","их","все","был","она",
  "он","мы","вы","ли","бы","же","ни","до","об","без","так","уже",
  "ещё","нет","да","ст","рф","какие","какой","каков","какова","каковы"
]);

function tokenize(text) {
  return text.toLowerCase().replace(/[«»"".,;:!?()—–\-\/\\№%]/g, " ")
    .split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function search(modeId, query, subMode = "all", topN = 5) {
  const kb = knowledgeBases[modeId] || [];
  const tokens = tokenize(query);
  if (tokens.length === 0 || kb.length === 0) return [];

  return kb
    .filter(item => subMode === "all" || !item.t || item.t === subMode)
    .map(item => {
      const itemTokens = tokenize(item.q + " " + item.a);
      let score = 0;
      for (const t of tokens) {
        for (const it of itemTokens) {
          if (it === t) score += 3;
          else if (it.startsWith(t) || t.startsWith(it)) score += 2;
          else if (it.includes(t) || t.includes(it)) score += 1;
        }
      }
      return { ...item, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ═══════════════════════════════════════════════
// Claude API
// ═══════════════════════════════════════════════
async function callClaude(systemPrompt, messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.MODEL || "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages
      })
    });
    const data = await res.json();
    if (data.error) { console.error("API Error:", data.error); return null; }
    return data.content?.map(i => i.text || "").join("\n") || null;
  } catch (err) {
    console.error("Fetch error:", err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════
// API: Список режимов
// ═══════════════════════════════════════════════
app.get("/api/modes", (req, res) => {
  const modes = Object.values(MODES).map(m => ({
    id: m.id, name: m.name, icon: m.icon,
    description: m.description, type: m.type,
    examples: m.examples, subModes: m.subModes,
    kbSize: (knowledgeBases[m.id] || []).length
  }));
  res.json({ modes, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
});

// ═══════════════════════════════════════════════
// API: Чат (универсальный для всех режимов)
// ═══════════════════════════════════════════════
app.post("/api/chat", async (req, res) => {
  const { message, modeId, subMode, history } = req.body;
  if (!message) return res.status(400).json({ error: "Пустое сообщение" });

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
  const messages = [];
  if (history && history.length > 0) {
    for (const h of history.slice(-12)) {
      messages.push({ role: h.role, content: h.text });
    }
  }

  const userContent = mode.type === "rag"
    ? `${contextBlock}\n\n---\nВОПРОС: ${message}`
    : message;
  messages.push({ role: "user", content: userContent });

  // Вызов Claude
  const answer = await callClaude(mode.systemPrompt, messages);

  if (answer) {
    res.json({ answer, sources: context, offline: false });
  } else {
    // Оффлайн
    let offlineAnswer;
    if (mode.type === "rag" && context.length > 0) {
      offlineAnswer = "📋 **Результаты из базы знаний:**\n\n" +
        context.map(c => `**${c.q}**\n${c.a}\n📌 _${c.r}_`).join("\n\n") +
        "\n\n---\n_⚡ Оффлайн-режим. Установите ANTHROPIC_API_KEY для полноценных ответов._";
    } else if (mode.type === "rag") {
      offlineAnswer = "В базе знаний не найдено релевантной информации. Установите API ключ для ответов на произвольные вопросы.";
    } else {
      offlineAnswer = `⚠️ Режим «${mode.name}» работает только с Claude API. Установите ANTHROPIC_API_KEY в переменных Railway.`;
    }
    res.json({ answer: offlineAnswer, sources: context, offline: true });
  }
});

// ═══════════════════════════════════════════════
// API: Поиск по базе знаний
// ═══════════════════════════════════════════════
app.post("/api/search", (req, res) => {
  const { query, modeId, subMode } = req.body;
  res.json({ results: search(modeId || "zhkh", query || "", subMode || "all") });
});

// ═══════════════════════════════════════════════
// API: Health check
// ═══════════════════════════════════════════════
app.get("/health", (req, res) => {
  const kbStats = {};
  for (const [k, v] of Object.entries(knowledgeBases)) kbStats[k] = v.length;
  res.json({ status: "ok", modes: Object.keys(MODES).length, kb: kbStats, uptime: process.uptime() });
});

// ═══════════════════════════════════════════════
// TELEGRAM BOT (с памятью)
// ═══════════════════════════════════════════════
if (process.env.TELEGRAM_BOT_TOKEN) {
  const TelegramBot = require("node-telegram-bot-api");
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  const userModes = {};   // chatId -> modeId
  const userHistory = {};  // chatId -> [{role, content}]
  const MAX_HISTORY = 20;  // Максимум сообщений в памяти

  console.log("🤖 Telegram-бот запущен (с памятью)");

  function getHistory(chatId) {
    if (!userHistory[chatId]) userHistory[chatId] = [];
    return userHistory[chatId];
  }

  function addToHistory(chatId, role, content) {
    const h = getHistory(chatId);
    h.push({ role, content: content.slice(0, 2000) }); // Лимит на сообщение
    while (h.length > MAX_HISTORY) h.shift(); // Удаляем старые
  }

  bot.onText(/\/start/, (msg) => {
    userModes[msg.chat.id] = "zhkh";
    userHistory[msg.chat.id] = []; // Сброс истории
    bot.sendMessage(msg.chat.id,
      "🏠 *AI Мультиассистент*\n\nВыберите режим:\n\n" +
      Object.values(MODES).map(m => `${m.icon} /mode\\_${m.id} — ${m.name}`).join("\n") +
      "\n\nТекущий режим: ⚖️ ЖКХ и Право\n🧠 Память: включена (помню контекст диалога)\n\nПросто напишите вопрос!",
      { parse_mode: "Markdown" }
    );
  });

  // Переключение режимов
  for (const mode of Object.values(MODES)) {
    bot.onText(new RegExp(`/mode_${mode.id}`), (msg) => {
      userModes[msg.chat.id] = mode.id;
      userHistory[msg.chat.id] = []; // Сброс при смене режима
      bot.sendMessage(msg.chat.id,
        `${mode.icon} Режим: *${mode.name}*\n${mode.description}\n\n🧠 История диалога очищена\n\nПримеры:\n` +
        mode.examples.map(e => `• _${e}_`).join("\n"),
        { parse_mode: "Markdown" }
      );
    });
  }

  bot.onText(/\/clear/, (msg) => {
    userHistory[msg.chat.id] = [];
    bot.sendMessage(msg.chat.id, "🧹 История диалога очищена. Начинаем с чистого листа.");
  });

  bot.onText(/\/memory/, (msg) => {
    const h = getHistory(msg.chat.id);
    const modeId = userModes[msg.chat.id] || "zhkh";
    const mode = MODES[modeId];
    bot.sendMessage(msg.chat.id,
      `🧠 *Память*\n\nРежим: ${mode.icon} ${mode.name}\nСообщений в памяти: ${h.length}/${MAX_HISTORY}\n\n/clear — очистить историю`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      "📋 *Команды:*\n" +
      "/start — Начало\n" +
      Object.values(MODES).map(m => `/mode\\_${m.id} — ${m.icon} ${m.name}`).join("\n") +
      "\n/mode — Текущий режим\n/memory — Состояние памяти\n/clear — Очистить историю\n/help — Эта справка",
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/mode$/, (msg) => {
    const modeId = userModes[msg.chat.id] || "zhkh";
    const mode = MODES[modeId];
    const h = getHistory(msg.chat.id);
    bot.sendMessage(msg.chat.id, `Режим: ${mode.icon} *${mode.name}*\n🧠 Сообщений в памяти: ${h.length}`, { parse_mode: "Markdown" });
  });

  // Обработка сообщений
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const chatId = msg.chat.id;
    const modeId = userModes[chatId] || "zhkh";
    const mode = MODES[modeId];

    bot.sendChatAction(chatId, "typing");

    // Запоминаем вопрос пользователя
    addToHistory(chatId, "user", msg.text);

    let context = [];
    let contextBlock = "";

    if (mode.type === "rag") {
      context = search(modeId, msg.text, "all");
      contextBlock = context.length > 0
        ? "КОНТЕКСТ:\n\n" + context.map((c, i) =>
            `[${i+1}] ${c.q}\n${c.a}\nИсточник: ${c.r}`
          ).join("\n\n")
        : "";
    }

    // Формируем сообщения с историей
    const history = getHistory(chatId);
    const apiMessages = [];

    // Берём последние N сообщений из истории (кроме текущего — оно будет последним)
    const prevMessages = history.slice(0, -1).slice(-10); // 10 последних, исключая текущее
    for (const h of prevMessages) {
      apiMessages.push({ role: h.role, content: h.content });
    }

    // Текущий вопрос с контекстом
    const userContent = contextBlock
      ? `${contextBlock}\n\n---\nВОПРОС: ${msg.text}`
      : msg.text;
    apiMessages.push({ role: "user", content: userContent });

    const answer = await callClaude(mode.systemPrompt, apiMessages);

    if (answer) {
      // Запоминаем ответ
      addToHistory(chatId, "assistant", answer);

      const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown" }).catch(() =>
          bot.sendMessage(chatId, chunk)
        );
      }
      if (context.length > 0) {
        const sources = "📎 " + context.map(c => c.r).join(" | ");
        if (sources.length < 4000) {
          await bot.sendMessage(chatId, sources).catch(() => {});
        }
      }
    } else if (mode.type === "rag" && context.length > 0) {
      let reply = "📋 Из базы знаний:\n\n";
      for (const c of context.slice(0, 3)) {
        reply += `❓ ${c.q}\n📝 ${c.a.slice(0, 300)}...\n📌 ${c.r}\n\n`;
      }
      reply += "⚡ Оффлайн-режим";
      addToHistory(chatId, "assistant", reply);
      const chunks = reply.match(/[\s\S]{1,4000}/g) || [reply];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk).catch(() => {});
      }
    } else {
      const errMsg = `⚠️ Режим «${mode.name}» требует API ключа.`;
      bot.sendMessage(chatId, errMsg);
    }
  });
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
app.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  🚀 AI Мультиассистент v2.0 запущен!         ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  🌐 http://localhost:${PORT}                     ║`);
  console.log(`║  📚 Режимов: ${Object.keys(MODES).length}                              ║`);
  console.log(`║  🔑 API: ${process.env.ANTHROPIC_API_KEY ? "✅" : "❌"}  TG: ${process.env.TELEGRAM_BOT_TOKEN ? "✅" : "❌"}                       ║`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
});
