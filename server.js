const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Fuse = require("fuse.js");

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
// Загрузка баз знаний (RAG) + построение Fuse-индексов
// ═══════════════════════════════════════════════
const knowledgeBases = {};
const fuseIndexes = {};

// Конфигурация Fuse: вес q выше, чем a (вопрос точнее отражает тему),
// includeScore — для гибридного ранжирования, threshold — терпимость к опечаткам.
const FUSE_OPTIONS = {
  keys: [
    { name: "q", weight: 0.65 },
    { name: "a", weight: 0.30 },
    { name: "r", weight: 0.05 }
  ],
  includeScore: true,
  ignoreLocation: true,   // важно для длинных текстов ответов
  threshold: 0.45,        // 0.0 — точное совпадение, 1.0 — любое
  minMatchCharLength: 3,
  useExtendedSearch: false
};

for (const [modeId, mode] of Object.entries(MODES)) {
  if (mode.type === "rag" && mode.kbFile) {
    const paths = [
      path.join(__dirname, "data", mode.kbFile),
      path.join(__dirname, mode.kbFile),
    ];
    const kbPath = paths.find(p => fs.existsSync(p));
    if (kbPath) {
      knowledgeBases[modeId] = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
      fuseIndexes[modeId] = new Fuse(knowledgeBases[modeId], FUSE_OPTIONS);
      console.log(`📚 ${mode.name}: ${knowledgeBases[modeId].length} вопросов загружено (Fuse-индекс построен)`);
    } else {
      console.log(`⚠️  ${mode.name}: файл ${mode.kbFile} не найден`);
      knowledgeBases[modeId] = [];
      fuseIndexes[modeId] = new Fuse([], FUSE_OPTIONS);
    }
  }
}

// ═══════════════════════════════════════════════
// Поисковый движок: гибридный (токены + fuzzy) + LRU-кэш
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

// --- Простой LRU-кэш на Map (insertion order) ---
class LRUCache {
  constructor(max = 200) { this.max = max; this.map = new Map(); this.hits = 0; this.misses = 0; }
  get(key) {
    if (!this.map.has(key)) { this.misses++; return undefined; }
    const v = this.map.get(key);
    this.map.delete(key); this.map.set(key, v); // bump recency
    this.hits++;
    return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  clear() { this.map.clear(); this.hits = 0; this.misses = 0; }
  stats() { return { size: this.map.size, max: this.max, hits: this.hits, misses: this.misses }; }
}
const searchCache = new LRUCache(Number(process.env.SEARCH_CACHE_SIZE) || 200);
const CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_MS) || 10 * 60 * 1000;

function normalizeQuery(q) {
  return (q || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// --- Token-overlap score (старая логика, для гибрида) ---
function tokenScore(queryTokens, item) {
  if (queryTokens.length === 0) return 0;
  const itemTokens = tokenize(item.q + " " + item.a);
  let score = 0;
  for (const t of queryTokens) {
    for (const it of itemTokens) {
      if (it === t) score += 3;
      else if (it.startsWith(t) || t.startsWith(it)) score += 2;
      else if (it.includes(t) || t.includes(it)) score += 1;
    }
  }
  // Нормализация по длине запроса, чтобы длинные запросы не перевешивали всё
  return score / Math.max(1, queryTokens.length);
}

/**
 * Гибридный поиск:
 *   final = 0.6 * fuzzy + 0.4 * token_overlap
 * Fuzzy даёт устойчивость к опечаткам и словоформам;
 * token-overlap — точные попадания терминологии.
 */
function search(modeId, query, subMode = "all", topN = 5) {
  const kb = knowledgeBases[modeId] || [];
  if (!query || kb.length === 0) return [];

  const cacheKey = `${modeId}|${subMode}|${topN}|${normalizeQuery(query)}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.results;

  const queryTokens = tokenize(query);

  // 1) Fuzzy-результаты (весь KB), Fuse сам отсеивает слабые совпадения по threshold
  const fuse = fuseIndexes[modeId];
  const fuseHits = fuse ? fuse.search(query) : [];
  // Fuse score: 0 — идеально, 1 — нерелевантно. Инвертируем.
  const fuzzyMap = new Map();
  for (const hit of fuseHits) fuzzyMap.set(hit.item, 1 - hit.score);

  // 2) Считаем гибридный score по всем кандидатам из fuse + (fallback) по токенам
  const candidates = new Set(fuseHits.map(h => h.item));
  if (candidates.size === 0 && queryTokens.length > 0) {
    // Если fuzzy ничего не нашёл — расширяем поиск по всей базе с token-score
    for (const it of kb) candidates.add(it);
  }

  const results = [];
  for (const item of candidates) {
    if (subMode !== "all" && item.t && item.t !== subMode) continue;
    const fuzzy = fuzzyMap.get(item) || 0;
    const tokens = tokenScore(queryTokens, item);
    // Нормализуем tokenScore в [0..1]: эмпирически делим на 10 с клампом
    const tokensNorm = Math.min(1, tokens / 10);
    const finalScore = 0.6 * fuzzy + 0.4 * tokensNorm;
    if (finalScore <= 0) continue;
    results.push({
      ...item,
      score: Number(finalScore.toFixed(4)),
      _fuzzy: Number(fuzzy.toFixed(4)),
      _tokens: Number(tokensNorm.toFixed(4))
    });
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, topN);
  searchCache.set(cacheKey, { ts: Date.now(), results: top });
  return top;
}

// ═══════════════════════════════════════════════
// Аудит базы знаний: пустые поля, точные и near-duplicates
// ═══════════════════════════════════════════════
function auditKB(modeId) {
  const kb = knowledgeBases[modeId] || [];
  const report = {
    mode: modeId,
    total: kb.length,
    emptyQ: 0, emptyA: 0, emptyR: 0, missingT: 0,
    exactDuplicates: [],
    nearDuplicates: [],
    avgAnswerLen: 0,
    fieldSet: new Set()
  };
  const seen = new Map();
  let lenSum = 0;

  for (let i = 0; i < kb.length; i++) {
    const it = kb[i];
    Object.keys(it).forEach(k => report.fieldSet.add(k));
    if (!it.q || !String(it.q).trim()) report.emptyQ++;
    if (!it.a || !String(it.a).trim()) report.emptyA++;
    if (!it.r || !String(it.r).trim()) report.emptyR++;
    if (!it.t) report.missingT++;
    lenSum += (it.a || "").length;
    const key = normalizeQuery(it.q);
    if (seen.has(key)) report.exactDuplicates.push({ i, j: seen.get(key), q: it.q });
    else seen.set(key, i);
  }
  report.avgAnswerLen = kb.length ? Math.round(lenSum / kb.length) : 0;
  report.fieldSet = [...report.fieldSet];

  // Near-duplicates по Jaccard-сходству токенов вопроса (>= 0.75)
  const tokenSets = kb.map(it => new Set(tokenize(it.q || "")));
  for (let i = 0; i < kb.length; i++) {
    for (let j = i + 1; j < kb.length; j++) {
      const A = tokenSets[i], B = tokenSets[j];
      if (A.size === 0 || B.size === 0) continue;
      let inter = 0;
      for (const t of A) if (B.has(t)) inter++;
      const jacc = inter / (A.size + B.size - inter);
      if (jacc >= 0.75) {
        report.nearDuplicates.push({ i, j, jaccard: Number(jacc.toFixed(3)), qi: kb[i].q, qj: kb[j].q });
      }
    }
  }
  return report;
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
  const { query, modeId, subMode, topN } = req.body;
  res.json({
    results: search(modeId || "zhkh", query || "", subMode || "all", topN || 5)
  });
});

// ═══════════════════════════════════════════════
// API: Аудит баз знаний
// ═══════════════════════════════════════════════
app.get("/api/kb-audit", (req, res) => {
  const reports = {};
  for (const modeId of Object.keys(knowledgeBases)) reports[modeId] = auditKB(modeId);
  res.json({ reports, cache: searchCache.stats() });
});

// ═══════════════════════════════════════════════
// API: Управление кэшем поиска
// ═══════════════════════════════════════════════
app.get("/api/cache-stats", (req, res) => res.json(searchCache.stats()));
app.post("/api/cache-clear", (req, res) => {
  searchCache.clear();
  res.json({ ok: true });
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
