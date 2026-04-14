// Утилиты валидации и санитизации входных данных API.
//
// Набор функций сознательно простой, без внешних зависимостей:
//   • sanitizeString   — приводит значение к строке, обрезает по длине.
//   • sanitizeHistory  — фильтрует массив истории диалога, отсекает
//                        невалидные элементы и лишние записи.
//   • validateRequired — бросает 400-ошибку, если значение пустое.
//   • validateBody     — legacy-middleware «тонкой» схемы полей тела.

const MAX_STRING_DEFAULT = 4000;
const MAX_HISTORY_ITEMS_DEFAULT = 20;

/**
 * Приводит значение к безопасной строке.
 *   • не-строки (null/undefined/number/boolean/object) → "".
 *   • строки длиннее maxLen обрезаются до maxLen.
 */
function sanitizeString(val, maxLen = MAX_STRING_DEFAULT) {
  if (typeof val !== "string") return "";
  if (!Number.isFinite(maxLen) || maxLen < 0) return val;
  if (val.length > maxLen) return val.slice(0, maxLen);
  return val;
}

/**
 * Нормализует массив истории диалога для LLM.
 *   • оставляет только последние maxItems элементов;
 *   • отбрасывает элементы без валидной role ("user" | "assistant");
 *   • извлекает текст из поля text или content, обрезает до maxContentLen;
 *   • отбрасывает элементы с пустым текстом.
 *
 * Возвращает массив { role, text } — гарантированно безопасный для LLM.
 */
function sanitizeHistory(
  arr,
  maxItems = MAX_HISTORY_ITEMS_DEFAULT,
  maxContentLen = MAX_STRING_DEFAULT
) {
  if (!Array.isArray(arr)) return [];
  const sliced = arr.slice(-maxItems);
  const out = [];
  for (const item of sliced) {
    if (!item || typeof item !== "object") continue;
    if (item.role !== "user" && item.role !== "assistant") continue;
    const rawText =
      typeof item.text === "string"
        ? item.text
        : typeof item.content === "string"
        ? item.content
        : "";
    const text = sanitizeString(rawText, maxContentLen);
    if (!text.trim()) continue;
    out.push({ role: item.role, text });
  }
  return out;
}

/**
 * Бросает Error со статусом 400, если значение отсутствует или пустое.
 */
function validateRequired(val, fieldName) {
  const empty =
    val === null ||
    val === undefined ||
    (typeof val === "string" && val.trim().length === 0);
  if (empty) {
    const err = new Error(`Поле "${fieldName}" обязательно`);
    err.statusCode = 400;
    throw err;
  }
}

// Простейшая схема-валидация body без внешних зависимостей.
// Схема: { field: { type: 'string'|'array'|'object', required?: boolean, min?: number } }
function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body || {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];
      const exists = value !== undefined && value !== null;

      if (rules.required && !exists) {
        return res.status(400).json({ error: `Поле "${field}" обязательно` });
      }
      if (!exists) continue;

      if (rules.type === "string") {
        if (typeof value !== "string") {
          return res.status(400).json({ error: `Поле "${field}" должно быть строкой` });
        }
        if (rules.min && value.trim().length < rules.min) {
          return res.status(400).json({ error: `Поле "${field}" должно быть не короче ${rules.min} символов` });
        }
      }

      if (rules.type === "array" && !Array.isArray(value)) {
        return res.status(400).json({ error: `Поле "${field}" должно быть массивом` });
      }

      if (rules.type === "object") {
        if (typeof value !== "object" || Array.isArray(value)) {
          return res.status(400).json({ error: `Поле "${field}" должно быть объектом` });
        }
      }
    }

    next();
  };
}

module.exports = {
  sanitizeString,
  sanitizeHistory,
  validateRequired,
  validateBody,
};
