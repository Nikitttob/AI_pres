// ═══════════════════════════════════════════════
// Роутер веб-панели управления базой знаний
// ═══════════════════════════════════════════════
const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { sanitizeString, validateRequired } = require("../middleware/validate");

/**
 * Фабрика роутера управления базами знаний.
 *
 * @param {object} deps
 * @param {object} deps.knowledgeBases  — кэш баз в памяти (мутируется)
 * @param {object} deps.MODES           — конфиг режимов
 * @param {object} deps.llm             — ProviderManager (для /generate)
 * @param {string} deps.rootDir         — корень проекта
 * @param {Function} [deps.adminLimiter] — rate-limit middleware
 */
function createKnowledgeRouter({ knowledgeBases, MODES, llm, rootDir, adminLimiter }) {
  const router = express.Router();
  const noop = (req, res, next) => next();
  const limiter = adminLimiter || noop;

  // Разрешаем больший payload для /generate (длинные тексты)
  router.use(express.json({ limit: "2mb" }));

  // ── Резолв пути к файлу базы ──────────────────
  function kbPath(modeId) {
    const mode = MODES[modeId];
    if (!mode || !mode.kbFile) return null;
    const candidates = [
      path.join(rootDir, "data", mode.kbFile),
      path.join(rootDir, mode.kbFile),
    ];
    return candidates.find((p) => fs.existsSync(p)) || path.join(rootDir, mode.kbFile);
  }

  // ── Bearer-авторизация ────────────────────────
  function auth(req, res, next) {
    const token = process.env.ADMIN_TOKEN || process.env.KB_ADMIN_TOKEN;
    if (!token) {
      return res.status(503).json({
        error: "Панель отключена: задайте ADMIN_TOKEN в .env",
      });
    }
    const header = req.headers.authorization || "";
    const got = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (got !== token) {
      return res.status(401).json({ error: "Неверный или отсутствующий токен" });
    }
    next();
  }

  // ── Маппинг внутренний ↔ API ──────────────────
  // Внутренний формат: { q, a, r, t? }
  // API-формат:        { question, answer, source, subMode? }
  function toApi(e, idx) {
    return {
      index: idx,
      question: e.q ?? e.question ?? "",
      answer: e.a ?? e.answer ?? "",
      source: e.r ?? e.source ?? "",
      subMode: e.t ?? undefined,
    };
  }

  function toStorage(item) {
    const entry = {
      q: String(item.question || "").trim(),
      a: String(item.answer || "").trim(),
      r: String(item.source || "").trim(),
    };
    const sub = item.subMode || item.t;
    if (sub) entry.t = String(sub).trim();
    return entry;
  }

  // Сериализуем в формат, принятый в проекте: открывающий/закрывающий скобки
  // на отдельных строках, каждый объект — компактно в одну строку.
  // Это минимизирует diff при ручных правках kb_*.json.
  function serializeKB(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return "[]\n";
    return "[\n" + arr.map((x) => JSON.stringify(x)).join(",\n") + "\n]\n";
  }

  async function saveKB(modeId) {
    const p = kbPath(modeId);
    if (!p) throw new Error(`kbFile не задан для "${modeId}"`);
    // Гарантируем существование директории
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, serializeKB(knowledgeBases[modeId]), "utf-8");
  }

  function hasBase(base) {
    return Object.prototype.hasOwnProperty.call(knowledgeBases, base);
  }

  // ── 1) GET /api/knowledge — список баз ────────
  router.get("/", auth, (req, res) => {
    const bases = Object.values(MODES)
      .filter((m) => m.type === "rag" && m.kbFile)
      .map((m) => ({
        id: m.id,
        name: m.name,
        icon: m.icon || "",
        file: m.kbFile,
        count: (knowledgeBases[m.id] || []).length,
        subModes: m.subModes || [],
      }));
    res.json({ bases });
  });

  // ── 2) GET /api/knowledge/:base — все записи ──
  router.get("/:base", auth, (req, res) => {
    const base = req.params.base;
    if (!hasBase(base)) return res.status(404).json({ error: "База не найдена" });
    const items = (knowledgeBases[base] || []).map(toApi);
    res.json({ base, count: items.length, items });
  });

  // ── 3) POST /api/knowledge/:base — добавить ───
  router.post("/:base", auth, limiter, async (req, res) => {
    const base = req.params.base;
    if (!hasBase(base)) return res.status(404).json({ error: "База не найдена" });

    let question, answer, source, subMode;
    try {
      question = sanitizeString(req.body?.question, 2000);
      validateRequired(question, "question");
      answer = sanitizeString(req.body?.answer, 10000);
      validateRequired(answer, "answer");
      source = sanitizeString(req.body?.source, 500);
      subMode = sanitizeString(req.body?.subMode, 100);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ error: e.message });
    }

    const entry = toStorage({ question, answer, source, subMode });
    knowledgeBases[base].push(entry);
    try {
      await saveKB(base);
    } catch (e) {
      knowledgeBases[base].pop();
      return res.status(500).json({ error: "Не удалось сохранить файл: " + e.message });
    }

    const idx = knowledgeBases[base].length - 1;
    res.json({ ok: true, added: toApi(entry, idx), count: knowledgeBases[base].length });
  });

  // ── 4) POST /api/knowledge/:base/generate — AI ─
  router.post("/:base/generate", auth, limiter, async (req, res) => {
    const base = req.params.base;
    if (!hasBase(base)) return res.status(404).json({ error: "База не найдена" });

    let text, source;
    try {
      text = sanitizeString(req.body?.text, 50000);
      validateRequired(text, "text");
      source = sanitizeString(req.body?.source, 500);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ error: e.message });
    }
    if (text.trim().length < 20) {
      return res.status(400).json({ error: "Передайте text (минимум 20 символов)" });
    }

    const systemPrompt =
      "Ты ассистент, разбивающий текст на пары вопрос-ответ для базы знаний. " +
      "Верни ТОЛЬКО валидный JSON-массив объектов вида " +
      '[{"question":"...","answer":"...","source":"..."}]. ' +
      "Без markdown, без пояснений, без обёртки в ```json. " +
      "Вопросы формулируй так, как их может задать пользователь. " +
      "Ответы — полные, самодостаточные, по-русски. " +
      "Если разбить невозможно — верни [].";

    const defaultSource = source ? String(source).trim() : "";
    const userMsg =
      `Разбей текст на пары вопрос-ответ в формате JSON ` +
      `[{question, answer, source}].\n` +
      (defaultSource ? `Источник по умолчанию: "${defaultSource}".\n` : "") +
      `\nТЕКСТ:\n${text}`;

    let raw;
    try {
      const resp = await llm.generateResponse(
        [{ role: "user", content: userMsg }],
        { systemPrompt, maxTokens: 4000 }
      );
      raw = resp && resp.answer;
    } catch (e) {
      return res.status(502).json({ error: "LLM ошибка: " + e.message });
    }
    if (!raw) {
      return res.status(502).json({ error: "Ни один LLM-провайдер не вернул ответ" });
    }

    // Попытка распарсить JSON. LLM иногда оборачивает в ```json ... ```
    let parsed = null;
    const tryParse = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };
    parsed = tryParse(raw);
    if (!parsed) {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) parsed = tryParse(m[0]);
    }
    if (!Array.isArray(parsed)) {
      return res.status(422).json({
        error: "Не удалось распарсить ответ LLM как JSON-массив",
        raw: raw.slice(0, 2000),
      });
    }

    const added = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") continue;
      const q = p.question || p.q;
      const a = p.answer || p.a;
      if (!q || !a) continue;
      const entry = toStorage({
        question: q,
        answer: a,
        source: p.source || p.r || defaultSource,
      });
      knowledgeBases[base].push(entry);
      added.push(toApi(entry, knowledgeBases[base].length - 1));
    }

    if (added.length === 0) {
      return res.status(422).json({ error: "LLM не вернул валидных пар", raw: raw.slice(0, 2000) });
    }

    try {
      await saveKB(base);
    } catch (e) {
      // Откат
      knowledgeBases[base].splice(knowledgeBases[base].length - added.length, added.length);
      return res.status(500).json({ error: "Не удалось сохранить файл: " + e.message });
    }

    res.json({
      ok: true,
      added: added.length,
      items: added,
      count: knowledgeBases[base].length,
      provider: "llm",
    });
  });

  // ── 5) DELETE /api/knowledge/:base/:index ─────
  router.delete("/:base/:index", auth, limiter, async (req, res) => {
    const base = req.params.base;
    const idx = parseInt(req.params.index, 10);
    if (!hasBase(base)) return res.status(404).json({ error: "База не найдена" });
    const arr = knowledgeBases[base];
    if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
      return res.status(400).json({ error: "Невалидный index" });
    }

    const [removed] = arr.splice(idx, 1);
    try {
      await saveKB(base);
    } catch (e) {
      arr.splice(idx, 0, removed); // откат
      return res.status(500).json({ error: "Не удалось сохранить файл: " + e.message });
    }
    res.json({ ok: true, removed: toApi(removed, idx), count: arr.length });
  });

  return router;
}

module.exports = { createKnowledgeRouter };
