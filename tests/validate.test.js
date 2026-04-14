const {
  sanitizeString,
  sanitizeHistory,
  validateRequired,
} = require("../src/middleware/validate");

describe("sanitizeString", () => {
  test("обрезает длинные строки до maxLen", () => {
    const long = "a".repeat(5000);
    const out = sanitizeString(long, 4000);
    expect(out.length).toBe(4000);
    expect(out).toBe("a".repeat(4000));
  });

  test("возвращает строку как есть, если короче maxLen", () => {
    expect(sanitizeString("hello", 100)).toBe("hello");
  });

  test("возвращает пустую строку для null/undefined/number/boolean/object", () => {
    expect(sanitizeString(null, 100)).toBe("");
    expect(sanitizeString(undefined, 100)).toBe("");
    expect(sanitizeString(42, 100)).toBe("");
    expect(sanitizeString(true, 100)).toBe("");
    expect(sanitizeString({ a: 1 }, 100)).toBe("");
    expect(sanitizeString([1, 2], 100)).toBe("");
  });
});

describe("sanitizeHistory", () => {
  test("отсекает лишние элементы, оставляя последние maxItems", () => {
    const arr = Array.from({ length: 30 }, (_, i) => ({
      role: "user",
      text: `msg-${i}`,
    }));
    const out = sanitizeHistory(arr, 20, 4000);
    expect(out).toHaveLength(20);
    expect(out[0].text).toBe("msg-10");
    expect(out[19].text).toBe("msg-29");
  });

  test("фильтрует элементы с невалидной role", () => {
    const arr = [
      { role: "user", text: "ok-1" },
      { role: "system", text: "drop" },
      { role: "bot", text: "drop" },
      { role: "assistant", text: "ok-2" },
      { role: null, text: "drop" },
      { text: "drop no role" },
    ];
    const out = sanitizeHistory(arr, 20, 4000);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(out.map((x) => x.text)).toEqual(["ok-1", "ok-2"]);
  });

  test("возвращает пустой массив, если передан не массив", () => {
    expect(sanitizeHistory(null)).toEqual([]);
    expect(sanitizeHistory(undefined)).toEqual([]);
    expect(sanitizeHistory("string")).toEqual([]);
    expect(sanitizeHistory({ role: "user", text: "x" })).toEqual([]);
  });

  test("обрезает длинный text до maxContentLen", () => {
    const arr = [{ role: "user", text: "a".repeat(10000) }];
    const out = sanitizeHistory(arr, 20, 4000);
    expect(out[0].text.length).toBe(4000);
  });

  test("пропускает пустые и невалидные элементы", () => {
    const arr = [
      { role: "user", text: "" },
      { role: "user", text: "   " },
      { role: "user" },
      null,
      "not-an-object",
      { role: "user", text: "valid" },
    ];
    const out = sanitizeHistory(arr, 20, 4000);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("valid");
  });

  test("поддерживает поле content как fallback", () => {
    const arr = [{ role: "assistant", content: "from-content" }];
    const out = sanitizeHistory(arr, 20, 4000);
    expect(out).toEqual([{ role: "assistant", text: "from-content" }]);
  });
});

describe("validateRequired", () => {
  test("бросает на пустой строке", () => {
    expect(() => validateRequired("", "message")).toThrow(/message/);
  });

  test("бросает на строке из пробелов", () => {
    expect(() => validateRequired("   \t\n", "message")).toThrow(/message/);
  });

  test("бросает на null/undefined", () => {
    expect(() => validateRequired(null, "q")).toThrow(/q/);
    expect(() => validateRequired(undefined, "q")).toThrow(/q/);
  });

  test("прикрепляет statusCode 400 к ошибке", () => {
    try {
      validateRequired("", "field");
      fail("должен был бросить");
    } catch (e) {
      expect(e.statusCode).toBe(400);
    }
  });

  test("не бросает на непустой строке", () => {
    expect(() => validateRequired("hi", "q")).not.toThrow();
  });
});
