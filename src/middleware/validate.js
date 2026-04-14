// Простейшая схема-валидация body без внешних зависимостей.
// Схема: { field: { type: 'string'|'array'|'object', required?: boolean, min?: number } }
function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body || {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];
      const exists = value !== undefined && value !== null;

      if (rules.required && !exists) {
        return res.status(400).json({ error: `Поле \"${field}\" обязательно` });
      }
      if (!exists) continue;

      if (rules.type === "string") {
        if (typeof value !== "string") {
          return res.status(400).json({ error: `Поле \"${field}\" должно быть строкой` });
        }
        if (rules.min && value.trim().length < rules.min) {
          return res.status(400).json({ error: `Поле \"${field}\" должно быть не короче ${rules.min} символов` });
        }
      }

      if (rules.type === "array" && !Array.isArray(value)) {
        return res.status(400).json({ error: `Поле \"${field}\" должно быть массивом` });
      }

      if (rules.type === "object") {
        if (typeof value !== "object" || Array.isArray(value)) {
          return res.status(400).json({ error: `Поле \"${field}\" должно быть объектом` });
        }
      }
    }

    next();
  };
}

module.exports = { validateBody };
