// ═══════════════════════════════════════════════
// Простой in-memory rate limiter (fixed-window)
// Без внешних зависимостей. Для одного инстанса
// приложения этого достаточно; при горизонтальном
// масштабировании нужен Redis-backend.
// ═══════════════════════════════════════════════

/**
 * Создаёт middleware для ограничения частоты запросов.
 *
 * @param {object} opts
 * @param {number} opts.windowMs — размер окна в миллисекундах
 * @param {number} opts.max      — максимум запросов в окне на один ключ
 * @param {string} [opts.name]   — имя лимитера (для заголовков/логов)
 * @param {(req: import('express').Request) => string} [opts.keyGenerator]
 */
function rateLimit({ windowMs, max, name = "default", keyGenerator } = {}) {
  if (!windowMs || !max) {
    throw new Error("rateLimit: windowMs и max обязательны");
  }

  const hits = new Map(); // key -> { count, resetAt }

  // Периодическая чистка устаревших записей, чтобы Map не рос бесконечно
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  sweep.unref?.();

  const getKey = keyGenerator || ((req) => {
    // Доверяем X-Forwarded-For только если app.set('trust proxy') задан.
    // По умолчанию используем req.ip (Express определит корректно).
    return req.ip || req.connection?.remoteAddress || "unknown";
  });

  return function rateLimitMiddleware(req, res, next) {
    const key = `${name}:${getKey(req)}`;
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Слишком много запросов. Попробуйте позже.",
        retryAfter: retryAfterSec,
      });
    }

    next();
  };
}

module.exports = { rateLimit };
