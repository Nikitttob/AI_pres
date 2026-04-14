// ═══════════════════════════════════════════════
// RAG-поиск по базе знаний (Q&A JSON)
// Вынесено из server.js для возможности юнит-тестирования.
// ═══════════════════════════════════════════════

const Fuse = require("fuse.js");

// legacy, используется в тестах
const STOP_WORDS = new Set([
  "и","в","на","по","с","к","о","из","за","от","для","не","что","как",
  "это","то","при","или","но","а","его","её","их","все","был","она",
  "он","мы","вы","ли","бы","же","ни","до","об","без","так","уже",
  "ещё","нет","да","ст","рф","какие","какой","каков","какова","каковы"
]);

/**
 * Разбивает текст на значимые токены: нижний регистр, без пунктуации,
 * без стоп-слов, длина > 2 символов.
 * @param {string} text
 * @returns {string[]}
 */
// legacy, используется в тестах
function tokenize(text) {
  if (typeof text !== "string") return [];
  return text.toLowerCase().replace(/[«»"".,;:!?()—–\-\/\\№%]/g, " ")
    .split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

let fuseByKb = new WeakMap();

function getFuse(kb, subMode) {
  let bySubMode = fuseByKb.get(kb);
  if (!bySubMode) {
    bySubMode = new Map();
    fuseByKb.set(kb, bySubMode);
  }

  const key = subMode || "all";
  if (bySubMode.has(key)) return bySubMode.get(key);

  const filteredKb = kb.filter((item) => key === "all" || !item.t || item.t === key);
  const fuse = new Fuse(filteredKb, {
    includeScore: true,
    threshold: 0.4,
    minMatchCharLength: 3,
    keys: [
      { name: "q", weight: 2 },
      { name: "a", weight: 1 },
      { name: "r", weight: 0.5 },
    ],
  });

  bySubMode.set(key, fuse);
  return fuse;
}

function invalidateSearchCache(modeId) {
  // modeId оставлен в интерфейсе для совместимости вызовов из роутов.
  // Текущая реализация очищает все индексы целиком.
  void modeId;
  fuseByKb = new WeakMap();
}

/**
 * Ищет релевантные Q&A в базе знаний.
 *
 * @param {Array<{q:string,a:string,r?:string,t?:string}>} kb — база знаний
 * @param {string} query — поисковый запрос пользователя
 * @param {string} [subMode="all"] — фильтр по полю t (категории)
 * @param {number} [topN=5] — сколько результатов вернуть
 * @returns {Array<object>} — отсортированные по score записи
 */
function search(kb, query, subMode = "all", topN = 5) {
  if (!Array.isArray(kb) || kb.length === 0) return [];
  if (typeof query !== "string" || query.trim() === "") return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const fuse = getFuse(kb, subMode);
  const found = fuse.search(query, { limit: topN });
  const mapped = found
    .map((res) => ({
      ...res.item,
      score: (1 - (typeof res.score === "number" ? res.score : 1)) * 10,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (mapped.length > 0) return mapped;

  return kb
    .filter(item => subMode === "all" || !item.t || item.t === subMode)
    .map(item => {
      const itemTokens = tokenize((item.q || "") + " " + (item.a || "") + " " + (item.r || ""));
      let score = 0;
      for (const t of queryTokens) {
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

module.exports = { search, tokenize, STOP_WORDS, invalidateSearchCache };
