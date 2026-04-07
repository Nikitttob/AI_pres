const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { tokenize, search: searchKb } = require("./lib/search");
const { loadEnvFile } = require("./lib/env-loader");

// ═══════════════════════════════════════════════
// Загрузка .env
// ═══════════════════════════════════════════════
loadEnvFile(path.join(__dirname, ".env"));

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
// Поисковый движок (из lib/search.js)
// ═══════════════════════════════════════════════
function search(modeId, query, subMode = "all", topN = 5) {
  return searchKb(knowledgeBases, modeId, query, subMode, topN);
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
// TELEGRAM BOT (с кнопками и памятью)
// ═══════════════════════════════════════════════
if (process.env.TELEGRAM_BOT_TOKEN) {
  const TelegramBot = require("node-telegram-bot-api");
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  const userModes = {};
  const userHistory = {};
  const MAX_HISTORY = 20;

  console.log("🤖 Telegram-бот запущен (с кнопками и памятью)");

  function getHistory(chatId) {
    if (!userHistory[chatId]) userHistory[chatId] = [];
    return userHistory[chatId];
  }
  function addToHistory(chatId, role, content) {
    const h = getHistory(chatId);
    h.push({ role, content: content.slice(0, 2000) });
    while (h.length > MAX_HISTORY) h.shift();
  }

  // ── Клавиатуры ──
  function modeKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: "⚖️ ЖКХ и Право", callback_data: "mode:zhkh" },
          { text: "📊 Экономика", callback_data: "mode:economics" }
        ],
        [
          { text: "✈️ Путешествия", callback_data: "mode:travel" },
          { text: "📈 Анализ рынка", callback_data: "mode:market" }
        ],
        [
          { text: "🎯 Презентации", callback_data: "mode:presentation" }
        ]
      ]
    };
  }

  function afterAnswerKeyboard(modeId) {
    return {
      inline_keyboard: [
        [
          { text: "🔄 Сменить режим", callback_data: "action:modes" },
          { text: "🧹 Очистить историю", callback_data: "action:clear" }
        ],
        [
          { text: "💡 Примеры вопросов", callback_data: "action:examples" },
          { text: "🧠 Память", callback_data: "action:memory" }
        ]
      ]
    };
  }

  function examplesKeyboard(modeId) {
    const mode = MODES[modeId] || MODES.zhkh;
    return {
      inline_keyboard: mode.examples.map(ex => [{ text: ex, callback_data: "ask:" + ex.slice(0, 60) }])
    };
  }

  // ── Отправка приветствия режима ──
  function sendModeGreeting(chatId, modeId) {
    const mode = MODES[modeId];
    bot.sendMessage(chatId,
      `${mode.icon} *Режим: ${mode.name}*\n\n${mode.description}\n\n🧠 Память включена — помню контекст диалога\n\nЗадайте вопрос или выберите пример:`,
      {
        parse_mode: "Markdown",
        reply_markup: examplesKeyboard(modeId)
      }
    );
  }

  // ── /start ──
  bot.onText(/\/start/, (msg) => {
    userModes[msg.chat.id] = "zhkh";
    userHistory[msg.chat.id] = [];
    bot.sendMessage(msg.chat.id,
      "🚀 *AI Мультиассистент*\n\n5 режимов работы с базами знаний и Claude AI.\nВыберите режим:",
      { parse_mode: "Markdown", reply_markup: modeKeyboard() }
    );
  });

  // ── Обработка нажатий на кнопки ──
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Закрываем "часики" на кнопке
    bot.answerCallbackQuery(query.id);

    // Выбор режима
    if (data.startsWith("mode:")) {
      const modeId = data.split(":")[1];
      if (MODES[modeId]) {
        userModes[chatId] = modeId;
        userHistory[chatId] = [];
        sendModeGreeting(chatId, modeId);
      }
      return;
    }

    // Действия
    if (data === "action:modes") {
      bot.sendMessage(chatId, "🔄 Выберите режим:", { reply_markup: modeKeyboard() });
      return;
    }

    if (data === "action:clear") {
      userHistory[chatId] = [];
      bot.sendMessage(chatId, "🧹 История очищена. Начинаем с чистого листа!");
      return;
    }

    if (data === "action:examples") {
      const modeId = userModes[chatId] || "zhkh";
      const mode = MODES[modeId];
      bot.sendMessage(chatId,
        `💡 Примеры для режима ${mode.icon} *${mode.name}*:`,
        { parse_mode: "Markdown", reply_markup: examplesKeyboard(modeId) }
      );
      return;
    }

    if (data === "action:memory") {
      const h = getHistory(chatId);
      const modeId = userModes[chatId] || "zhkh";
      const mode = MODES[modeId];
      bot.sendMessage(chatId,
        `🧠 *Память*\n\nРежим: ${mode.icon} ${mode.name}\nСообщений: ${h.length}/${MAX_HISTORY}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Быстрый вопрос из примеров
    if (data.startsWith("ask:")) {
      const question = data.slice(4);
      // Имитируем отправку сообщения
      await handleUserMessage(chatId, question);
      return;
    }
  });

  // ── Текстовые команды (fallback) ──
  bot.onText(/\/mode$/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔄 Выберите режим:", { reply_markup: modeKeyboard() });
  });
  bot.onText(/\/clear/, (msg) => {
    userHistory[msg.chat.id] = [];
    bot.sendMessage(msg.chat.id, "🧹 История очищена!");
  });
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      "📋 *Команды:*\n\n" +
      "/start — Начало\n" +
      "/mode — Выбор режима\n" +
      "/clear — Очистить историю\n" +
      "/help — Справка\n\n" +
      "Или просто напишите вопрос!",
      { parse_mode: "Markdown" }
    );
  });

  // Переключение режимов текстовыми командами (для совместимости)
  for (const mode of Object.values(MODES)) {
    bot.onText(new RegExp(`/mode_${mode.id}`), (msg) => {
      userModes[msg.chat.id] = mode.id;
      userHistory[msg.chat.id] = [];
      sendModeGreeting(msg.chat.id, mode.id);
    });
  }

  // ── Основная обработка сообщений ──
  async function handleUserMessage(chatId, text) {
    const modeId = userModes[chatId] || "zhkh";
    const mode = MODES[modeId];

    bot.sendChatAction(chatId, "typing");
    addToHistory(chatId, "user", text);

    let context = [];
    let contextBlock = "";

    if (mode.type === "rag") {
      context = search(modeId, text, "all");
      contextBlock = context.length > 0
        ? "КОНТЕКСТ:\n\n" + context.map((c, i) =>
            `[${i+1}] ${c.q}\n${c.a}\nИсточник: ${c.r}`
          ).join("\n\n")
        : "";
    }

    const history = getHistory(chatId);
    const apiMessages = [];
    const prevMessages = history.slice(0, -1).slice(-10);
    for (const h of prevMessages) {
      apiMessages.push({ role: h.role, content: h.content });
    }

    const userContent = contextBlock
      ? `${contextBlock}\n\n---\nВОПРОС: ${text}`
      : text;
    apiMessages.push({ role: "user", content: userContent });

    const answer = await callClaude(mode.systemPrompt, apiMessages);

    if (answer) {
      addToHistory(chatId, "assistant", answer);
      const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const opts = { parse_mode: "Markdown" };
        // Кнопки только после последнего чанка
        if (isLast) opts.reply_markup = afterAnswerKeyboard(modeId);
        await bot.sendMessage(chatId, chunks[i], opts).catch(() =>
          bot.sendMessage(chatId, chunks[i], isLast ? { reply_markup: afterAnswerKeyboard(modeId) } : {})
        );
      }
      // Источники
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
      await bot.sendMessage(chatId, reply, { reply_markup: afterAnswerKeyboard(modeId) }).catch(() =>
        bot.sendMessage(chatId, reply)
      );
    } else {
      bot.sendMessage(chatId,
        `⚠️ Режим «${mode.name}» требует API ключа для ответов без базы знаний.`,
        { reply_markup: modeKeyboard() }
      );
    }
  }

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    await handleUserMessage(msg.chat.id, msg.text);
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
