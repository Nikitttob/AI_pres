"use strict";

/**
 * Поисковый движок по Q&A-базе знаний.
 *
 * Что улучшено по сравнению со старым `search()` в server.js:
 *   1. Fuzzy-поиск через fuse.js (опечатки, морфология, частичные совпадения).
 *   2. Гибридный скоринг: fuse-сходство + токен-оверлэп + бонусы за
 *      точное/префиксное совпадение вопроса.
 *   3. LRU-кэш с TTL для частых запросов.
 *   4. Изоляция от server.js — легко тестируется и переиспользуется.
 */

const Fuse = require("fuse.js");

const STOP_WORDS = new Set([
  "и","в","на","по","с","к","о","из","за","от","для","не","что","как",
  "это","то","при","или","но","а","его","её","их","все","был","она",
  "он","мы","вы","ли","бы","же","ни","до","об","без","так","уже",
  "ещё","нет","да","ст","рф","какие","какой","каков","какова","каковы",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[«»""".,;:!?()—–\-\/\\№%]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

const FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.45,        // 0 — точно, 1 — что угодно
  distance: 200,
  minMatchCharLength: 3,
  useExtendedSearch: false,
  keys: [
    { name: "q", weight: 0.6 },
    { name: "a", weight: 0.3 },
    { name: "r", weight: 0.1 },
  ],
};

class KBSearchEngine {
  /**
   * @param {Array<{q:string,a:string,r:string,t?:string}>} kb
   * @param {object} [opts]
   * @param {number} [opts.cacheSize=200]   — сколько ответов держать в LRU
   * @param {number} [opts.cacheTTL=300000] — TTL кэша, мс (по умолч. 5 минут)
   * @param {object} [opts.fuse]            — переопределение опций fuse.js
   */
  constructor(kb, opts = {}) {
    this.kb = Array.isArray(kb) ? kb : [];
    this.cacheSize = opts.cacheSize ?? 200;
    this.cacheTTL = opts.cacheTTL ?? 5 * 60 * 1000;
    this.cache = new Map();
    this.metrics = { hits: 0, misses: 0, evictions: 0 };
    this.fuse = new Fuse(this.kb, { ...FUSE_OPTIONS, ...(opts.fuse || {}) });
  }

  /**
   * Основной поиск.
   * @param {string} query
   * @param {object} [opts]
   * @param {string} [opts.subMode="all"]
   * @param {number} [opts.topN=5]
   * @returns {Array<object>} элементы KB с дополнительным полем `score`.
   */
  search(query, opts = {}) {
    const subMode = opts.subMode || "all";
    const topN = opts.topN || 5;
    const q = String(query || "").trim();
    if (!q || this.kb.length === 0) return [];

    const cacheKey = `${subMode}::${topN}::${q.toLowerCase()}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.at < this.cacheTTL) {
      // LRU: переместить в конец
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      this.metrics.hits++;
      return cached.results;
    }
    this.metrics.misses++;

    const tokens = tokenize(q);
    const queryLower = q.toLowerCase();

    // 1) Fuzzy-кандидаты от fuse.js
    const fuseResults = this.fuse.search(q, { limit: topN * 4 });

    // 2) Гибридный скоринг + фильтрация по subMode
    const scored = fuseResults
      .filter((r) => subMode === "all" || !r.item.t || r.item.t === subMode)
      .map((r) => this._score(r, tokens, queryLower))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    // 3) Запись в LRU
    if (this.cache.size >= this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.metrics.evictions++;
    }
    this.cache.set(cacheKey, { results: scored, at: now });

    return scored;
  }

  _score(fuseResult, tokens, queryLower) {
    const item = fuseResult.item;
    // fuse.js: score 0 — идеально, 1 — мимо. Конвертируем «больше = лучше».
    const fuzzy = (1 - (fuseResult.score ?? 1)) * 5;

    // Токен-оверлэп (более «жёсткое» совпадение по словам)
    let tokenScore = 0;
    if (tokens.length) {
      const itemTokens = tokenize(item.q + " " + item.a);
      const itemSet = new Set(itemTokens);
      for (const t of tokens) {
        if (itemSet.has(t)) {
          tokenScore += 3;
          continue;
        }
        for (const it of itemTokens) {
          if (it.startsWith(t) || t.startsWith(it)) {
            tokenScore += 1.5;
            break;
          } else if (it.length > 4 && (it.includes(t) || t.includes(it))) {
            tokenScore += 0.7;
            break;
          }
        }
      }
    }

    // Бонусы за качество совпадения с самим вопросом
    const qLower = String(item.q || "").toLowerCase();
    let bonus = 0;
    if (qLower === queryLower) bonus += 6;
    else if (qLower.includes(queryLower)) bonus += 2;

    return { ...item, score: +(fuzzy + tokenScore + bonus).toFixed(3) };
  }

  /** Очистить кэш (например, после перезагрузки KB). */
  clearCache() {
    this.cache.clear();
  }

  /** Метрики попаданий/промахов кэша. */
  stats() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      size: this.cache.size,
      hitRate: total ? +(this.metrics.hits / total).toFixed(3) : 0,
    };
  }
}

module.exports = { KBSearchEngine, tokenize, STOP_WORDS };
