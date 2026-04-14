function normalize(text) {
  return String(text || "").toLowerCase();
}

function splitTokens(text) {
  return normalize(text).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return Math.max(0, 1 - levenshtein(a, b) / maxLen);
}

class Fuse {
  constructor(list, options = {}) {
    this.list = Array.isArray(list) ? list : [];
    this.options = options;
    this.keys = Array.isArray(options.keys) ? options.keys : [];
    this.threshold = typeof options.threshold === "number" ? options.threshold : 0.6;
    this.minMatchCharLength = options.minMatchCharLength || 1;
    this.includeScore = Boolean(options.includeScore);
  }

  search(pattern, opts = {}) {
    const query = normalize(pattern).trim();
    if (!query) return [];
    const queryTokens = splitTokens(query).filter((t) => t.length >= this.minMatchCharLength);
    if (queryTokens.length === 0) return [];

    const weighted = this.keys.map((k) => ({ key: k.name || k, weight: Number(k.weight) || 1 }));
    const totalWeight = weighted.reduce((acc, k) => acc + k.weight, 0) || 1;

    const results = [];
    for (let i = 0; i < this.list.length; i++) {
      const item = this.list[i];
      let agg = 0;
      for (const { key, weight } of weighted) {
        const field = normalize(item && item[key]);
        if (!field) continue;
        const fieldTokens = splitTokens(field);
        let sum = 0;
        let matched = 0;
        for (const qt of queryTokens) {
          let best = similarity(qt, field);
          for (const ft of fieldTokens) {
            if (ft.length < this.minMatchCharLength) continue;
            best = Math.max(best, similarity(qt, ft));
          }
          if (best >= 0.45) {
            sum += best;
            matched++;
          }
        }
        if (matched > 0) {
          const coverage = matched / queryTokens.length;
          const tokenScore = (sum / matched) * (0.4 + 0.6 * coverage);
          agg += tokenScore * weight;
        }
      }
      const sim = agg / totalWeight;
      const score = 1 - sim;
      if (score <= this.threshold) {
        const row = { item, refIndex: i };
        if (this.includeScore) row.score = score;
        results.push(row);
      }
    }

    results.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    if (opts && Number.isInteger(opts.limit)) return results.slice(0, opts.limit);
    return results;
  }
}

module.exports = Fuse;
