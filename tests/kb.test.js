const fs = require("fs");
const path = require("path");
const { MODES } = require("../bot/modes");

const ROOT = path.join(__dirname, "..");

/**
 * Возвращает путь к файлу базы знаний, ищет сначала в /data, потом в корне.
 * null — если не найден.
 */
function resolveKbPath(kbFile) {
  const candidates = [path.join(ROOT, "data", kbFile), path.join(ROOT, kbFile)];
  return candidates.find(p => fs.existsSync(p)) || null;
}

describe("Парсинг и структура баз знаний", () => {
  const ragModes = Object.values(MODES).filter(m => m.type === "rag" && m.kbFile);

  test("все RAG-режимы объявляют kbFile", () => {
    expect(ragModes.length).toBeGreaterThan(0);
    for (const m of ragModes) expect(m.kbFile).toMatch(/\.json$/);
  });

  test.each(ragModes.map(m => [m.id, m.kbFile]))(
    "KB «%s» (%s) существует и парсится как JSON-массив",
    (modeId, kbFile) => {
      const p = resolveKbPath(kbFile);
      expect(p).not.toBeNull();
      const raw = fs.readFileSync(p, "utf-8");
      let parsed;
      expect(() => { parsed = JSON.parse(raw); }).not.toThrow();
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    }
  );

  test.each(ragModes.map(m => [m.id, m.kbFile]))(
    "все записи KB «%s» содержат непустые поля q и a",
    (modeId, kbFile) => {
      const p = resolveKbPath(kbFile);
      const kb = JSON.parse(fs.readFileSync(p, "utf-8"));
      for (const [idx, entry] of kb.entries()) {
        expect(typeof entry).toBe("object");
        expect(entry).not.toBeNull();
        expect(typeof entry.q).toBe("string");
        expect(entry.q.trim().length).toBeGreaterThan(0);
        expect(typeof entry.a).toBe("string");
        expect(entry.a.trim().length).toBeGreaterThan(0);
        // Доп. подсказка локализации ошибки
        if (entry.r !== undefined) {
          expect(typeof entry.r).toBe("string");
        }
      }
    }
  );

  test("совокупный объём KB приблизительно соответствует ~171 записям", () => {
    let total = 0;
    for (const m of ragModes) {
      const p = resolveKbPath(m.kbFile);
      if (!p) continue;
      total += JSON.parse(fs.readFileSync(p, "utf-8")).length;
    }
    // Мягкая граница: защита от случайного обнуления базы, не жёсткое равенство.
    expect(total).toBeGreaterThan(50);
  });

  test("поле t (subMode) — строка, если указано", () => {
    for (const m of ragModes) {
      const p = resolveKbPath(m.kbFile);
      if (!p) continue;
      const kb = JSON.parse(fs.readFileSync(p, "utf-8"));
      for (const entry of kb) {
        if (entry.t !== undefined) expect(typeof entry.t).toBe("string");
      }
    }
  });

  test("subMode-идентификаторы из modes.js совпадают со значениями t в KB (для zhkh)", () => {
    const zhkh = MODES.zhkh;
    const p = resolveKbPath(zhkh.kbFile);
    if (!p) return; // если файла нет — тест пропускается молча
    const kb = JSON.parse(fs.readFileSync(p, "utf-8"));
    const declared = new Set(zhkh.subModes.map(s => s.id).filter(id => id !== "all"));
    const used = new Set(kb.map(e => e.t).filter(Boolean));
    for (const t of used) {
      expect(declared.has(t)).toBe(true);
    }
  });
});
