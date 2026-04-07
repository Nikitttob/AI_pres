const { tokenize, search, STOP_WORDS } = require("../lib/search");

// ─── tokenize() ───────────────────────────────────

describe("tokenize", () => {
  test("lowercases input", () => {
    expect(tokenize("БАНК Капитал")).toEqual(["банк", "капитал"]);
  });

  test("removes punctuation and special characters", () => {
    expect(tokenize("ст. 158 ГК РФ (часть 1)")).toEqual(["158", "часть"]);
  });

  test("filters out stop words", () => {
    const result = tokenize("какие банки для капремонта");
    expect(result).not.toContain("какие");
    expect(result).not.toContain("для");
    expect(result).toContain("банки");
    expect(result).toContain("капремонта");
  });

  test("filters out short words (length <= 2)", () => {
    const result = tokenize("я ем суп из чашки");
    expect(result).not.toContain("я");
    expect(result).not.toContain("ем");
    expect(result).toContain("суп");
    expect(result).toContain("чашки");
  });

  test("splits on whitespace correctly", () => {
    expect(tokenize("банк   капитал\tремонт")).toEqual(["банк", "капитал", "ремонт"]);
  });

  test("handles empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("handles string with only stop words", () => {
    expect(tokenize("и в на по с")).toEqual([]);
  });

  test("handles string with only punctuation", () => {
    expect(tokenize("...!?—")).toEqual([]);
  });

  test("removes « » quotes", () => {
    expect(tokenize("режим «Экономика»")).toEqual(["режим", "экономика"]);
  });

  test("handles №, %, /", () => {
    const result = tokenize("закон №123/45 на 50%");
    expect(result).toContain("123");
    expect(result).toContain("закон");
  });
});

// ─── search() ──────────────────────────────────────

describe("search", () => {
  const mockKB = {
    test: [
      { q: "Что такое банк?", a: "Банк — кредитная организация", r: "ГК РФ", t: "l" },
      { q: "Как открыть спецсчёт капремонта?", a: "Спецсчёт открывается в банке из перечня ЦБ", r: "ЖК РФ ст.176", t: "b" },
      { q: "Права собственника жилья", a: "Собственник имеет право владения, пользования и распоряжения", r: "ГК РФ ст.209", t: "l" },
      { q: "Процедура капитального ремонта", a: "Капитальный ремонт проводится по решению общего собрания", r: "ЖК РФ ст.189", t: "b" },
      { q: "Инфляция и ставки", a: "При росте инфляции ЦБ повышает ключевую ставку", r: "Экономика", t: "all" },
    ]
  };

  test("returns results matching query tokens", () => {
    const results = search(mockKB, "test", "банк спецсчёт");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  test("returns empty array for empty query", () => {
    expect(search(mockKB, "test", "")).toEqual([]);
  });

  test("returns empty array for query with only stop words", () => {
    expect(search(mockKB, "test", "и в на")).toEqual([]);
  });

  test("returns empty array for nonexistent mode", () => {
    expect(search(mockKB, "nonexistent", "банк")).toEqual([]);
  });

  test("filters by subMode", () => {
    const results = search(mockKB, "test", "банк капремонт", "b");
    for (const r of results) {
      expect(r.t === "b" || !r.t).toBeTruthy();
    }
  });

  test("subMode 'all' returns items from all types", () => {
    const results = search(mockKB, "test", "банк капремонт ремонт", "all");
    const types = new Set(results.map(r => r.t));
    expect(types.size).toBeGreaterThan(1);
  });

  test("results are sorted by score descending", () => {
    const results = search(mockKB, "test", "банк капремонт спецсчёт", "all");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test("respects topN limit", () => {
    const results = search(mockKB, "test", "банк ремонт собственник", "all", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("exact match scores higher than prefix match", () => {
    const kb = {
      m: [
        { q: "банк", a: "точное совпадение", r: "src1" },
        { q: "банкомат", a: "только префикс", r: "src2" },
      ]
    };
    const results = search(kb, "m", "банк");
    expect(results[0].a).toBe("точное совпадение");
  });

  test("items without type field pass subMode filter", () => {
    const kb = {
      m: [{ q: "тест вопрос", a: "тест ответ", r: "src" }]
    };
    const results = search(kb, "m", "тест", "b");
    expect(results.length).toBe(1);
  });

  test("returns results with score property", () => {
    const results = search(mockKB, "test", "банк");
    for (const r of results) {
      expect(r).toHaveProperty("score");
      expect(typeof r.score).toBe("number");
    }
  });
});
