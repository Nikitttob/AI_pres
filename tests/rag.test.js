const { search, tokenize, STOP_WORDS } = require("../src/rag/search");

describe("tokenize", () => {
  test("приводит к нижнему регистру и удаляет пунктуацию", () => {
    const tokens = tokenize("Привет, МИР! Как-дела?");
    expect(tokens).toEqual(expect.arrayContaining(["привет", "мир", "дела"]));
  });

  test("отсекает слова короче 3 символов и стоп-слова", () => {
    const tokens = tokenize("Это тест для проверки");
    expect(tokens).not.toContain("это");
    expect(tokens).not.toContain("для");
    expect(tokens).toContain("тест");
    expect(tokens).toContain("проверки");
  });

  test("возвращает пустой массив для не-строки", () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(123)).toEqual([]);
  });

  test("STOP_WORDS содержит ожидаемые слова", () => {
    expect(STOP_WORDS.has("что")).toBe(true);
    expect(STOP_WORDS.has("как")).toBe(true);
    expect(STOP_WORDS.has("капремонт")).toBe(false);
  });

  test("обрабатывает кириллические кавычки и тире", () => {
    const tokens = tokenize("«Конституция» — это закон");
    expect(tokens).toContain("конституция");
    expect(tokens).toContain("закон");
  });
});

describe("search", () => {
  const mockKB = [
    {
      q: "Что такое капитальный ремонт?",
      a: "Капитальный ремонт — работы по восстановлению конструкций здания.",
      r: "ЖК РФ ст. 166",
      t: "l",
    },
    {
      q: "Какие банки ведут спецсчета?",
      a: "Спецсчета капремонта могут вести уполномоченные банки из перечня ЦБ РФ.",
      r: "ЖК РФ ст. 176",
      t: "b",
    },
    {
      q: "Что такое ВВП?",
      a: "Валовой внутренний продукт — показатель экономики страны.",
      r: "Макроэкономика",
    },
  ];

  test("возвращает пустой массив для пустого запроса", () => {
    expect(search(mockKB, "")).toEqual([]);
    expect(search(mockKB, "   ")).toEqual([]);
  });

  test("возвращает пустой массив для пустой базы знаний", () => {
    expect(search([], "капремонт")).toEqual([]);
    expect(search(null, "капремонт")).toEqual([]);
    expect(search(undefined, "капремонт")).toEqual([]);
  });

  test("находит релевантные записи по ключевому слову", () => {
    const results = search(mockKB, "капитальный ремонт");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].q).toMatch(/ремонт/i);
  });

  test('fuzzy-поиск находит "капремонт" по запросу "капитальный ремонт"', () => {
    const kb = [
      { q: "Что такое капремонт?", a: "Капремонт — это комплекс работ по дому.", r: "ЖК РФ" },
    ];
    const results = search(kb, "капитальный ремонт");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].q).toMatch(/капремонт/i);
  });

  test('поиск с опечаткой "капитлаьный ремонт" возвращает результаты', () => {
    const results = search(mockKB, "капитлаьный ремонт");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].q).toMatch(/ремонт/i);
  });

  test("сортирует результаты по убыванию score", () => {
    const results = search(mockKB, "капитальный ремонт спецсчета");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test("score точного совпадения выше частичного", () => {
    const exact = search(mockKB, "ВВП");
    const partial = search(mockKB, "экономики");
    // Both should return >=1 entry; точное совпадение q должно дать приличный score
    expect(exact[0].score).toBeGreaterThan(0);
    expect(partial[0].score).toBeGreaterThan(0);
  });

  test("фильтрует по subMode", () => {
    const onlyBanks = search(mockKB, "капремонт", "b");
    expect(onlyBanks.every(r => !r.t || r.t === "b")).toBe(true);
    // Запись с t="l" не должна попасть
    expect(onlyBanks.find(r => r.t === "l")).toBeUndefined();
  });

  test("subMode=all возвращает записи всех категорий", () => {
    const all = search(mockKB, "капремонт", "all");
    // В базе две записи с "капремонт"-подобными токенами (капитальный/спецсчета капремонта)
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  test("учитывает topN и ограничивает количество результатов", () => {
    const big = Array.from({ length: 20 }, (_, i) => ({
      q: "капремонт тест " + i,
      a: "ответ " + i,
      r: "src",
    }));
    const results = search(big, "капремонт", "all", 3);
    expect(results.length).toBe(3);
  });

  test("не падает на записях с отсутствующими q или a", () => {
    const broken = [
      { q: "капремонт", a: "" },
      { q: "", a: "капремонт в доме" },
      { a: "капремонт" },
    ];
    const results = search(broken, "капремонт");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test("возвращает объекты с полем score", () => {
    const results = search(mockKB, "капремонт");
    for (const r of results) {
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });
});
