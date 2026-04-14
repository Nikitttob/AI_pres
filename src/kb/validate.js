"use strict";

/**
 * Валидатор Q&A-баз знаний.
 *
 * Формат записи:
 *   { q: string, a: string, r: string, t?: string }
 *
 * Проверяет:
 *   - наличие обязательных полей q/a/r
 *   - пустые строки и подозрительно короткие ответы
 *   - точные дубликаты вопросов (нормализованных)
 *   - битые/подозрительные ссылки в полях a/r
 *   - неизвестные подрежимы (если задан whitelist)
 */

const URL_RE = /https?:\/\/[^\s)"']+/g;

function normalize(q) {
  return String(q || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBrokenUrl(url) {
  // Грубая эвристика: ловим явно сломанные URL без TLD,
  // с двойными слешами в пути, оборванные на полуслове.
  if (!/^https?:\/\/[^\/\s]+\.[^\/\s]+/i.test(url)) return true;
  if (/\s/.test(url)) return true;
  return false;
}

function validateKB(kb, { name = "kb", knownSubModes = null } = {}) {
  const issues = [];
  const seen = new Map();
  const stats = {
    total: kb.length,
    duplicates: 0,
    emptyFields: 0,
    suspiciousLinks: 0,
    unknownTags: 0,
    shortAnswers: 0,
  };

  kb.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      issues.push({ index: i, level: "error", msg: "запись не объект" });
      return;
    }
    for (const f of ["q", "a", "r"]) {
      if (!item[f] || !String(item[f]).trim()) {
        stats.emptyFields++;
        issues.push({ index: i, level: "error", msg: `пустое поле "${f}"` });
      }
    }
    if (item.a && String(item.a).trim().length < 30) {
      stats.shortAnswers++;
      issues.push({ index: i, level: "warn", msg: "слишком короткий ответ (<30 симв.)" });
    }
    const key = normalize(item.q);
    if (key) {
      if (seen.has(key)) {
        stats.duplicates++;
        issues.push({
          index: i,
          level: "warn",
          msg: `дубликат вопроса (см. #${seen.get(key)})`,
        });
      } else {
        seen.set(key, i);
      }
    }
    const text = `${item.a || ""} ${item.r || ""}`;
    const urls = text.match(URL_RE) || [];
    for (const u of urls) {
      if (isBrokenUrl(u)) {
        stats.suspiciousLinks++;
        issues.push({ index: i, level: "warn", msg: `подозрительная ссылка: ${u}` });
      }
    }
    if (knownSubModes && item.t && !knownSubModes.includes(item.t)) {
      stats.unknownTags++;
      issues.push({ index: i, level: "warn", msg: `неизвестный подрежим t="${item.t}"` });
    }
  });

  return { name, stats, issues };
}

function formatReport(report) {
  const { name, stats, issues } = report;
  const lines = [];
  lines.push(`📋 KB "${name}": ${stats.total} записей`);
  lines.push(
    `   дубликатов: ${stats.duplicates}, пустых полей: ${stats.emptyFields}, ` +
      `коротких ответов: ${stats.shortAnswers}, подозрительных ссылок: ${stats.suspiciousLinks}, ` +
      `неизвестных тэгов: ${stats.unknownTags}`
  );
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    lines.push(`   ❌ ошибок: ${errors.length}`);
    for (const e of errors.slice(0, 5)) lines.push(`      #${e.index}: ${e.msg}`);
  }
  return lines.join("\n");
}

module.exports = { validateKB, formatReport, normalize };

// CLI: `node src/kb/validate.js kb_zhkh.json kb_economics.json ...`
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node src/kb/validate.js <kb1.json> [kb2.json ...]");
    process.exit(1);
  }
  let exit = 0;
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, "utf-8"));
    const report = validateKB(data, { name: path.basename(f) });
    console.log(formatReport(report));
    if (report.issues.some((i) => i.level === "error")) exit = 1;
  }
  process.exit(exit);
}
