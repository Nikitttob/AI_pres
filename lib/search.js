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

function search(knowledgeBases, modeId, query, subMode = "all", topN = 5) {
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

module.exports = { tokenize, search, STOP_WORDS };
