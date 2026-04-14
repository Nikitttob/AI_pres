const {
  LLMProvider,
  ClaudeProvider,
  OllamaProvider,
  GigaChatProvider,
  ProviderManager,
  getLLMProvider,
  resetLLMProvider,
  REGISTRY,
} = require("../src/llm");

describe("LLMProvider (базовый класс)", () => {
  test("generateResponse() не реализован по умолчанию", async () => {
    const p = new LLMProvider();
    await expect(p.generateResponse("hi")).rejects.toThrow(/не реализован/);
  });

  test("isAvailable() по умолчанию false", () => {
    expect(new LLMProvider().isAvailable()).toBe(false);
  });

  test("checkAvailability() делегирует в isAvailable()", async () => {
    const p = new LLMProvider();
    p.isAvailable = () => true;
    await expect(p.checkAvailability()).resolves.toBe(true);
  });

  test("_normalizeMessages принимает строку", () => {
    const p = new LLMProvider();
    expect(p._normalizeMessages("hello")).toEqual([
      { role: "user", content: "hello" },
    ]);
  });

  test("_normalizeMessages принимает массив сообщений", () => {
    const p = new LLMProvider();
    const out = p._normalizeMessages([
      { role: "user", content: "привет" },
      { role: "assistant", content: "здравствуйте" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "привет" },
      { role: "assistant", content: "здравствуйте" },
    ]);
  });

  test("_normalizeMessages приводит незнакомую роль к 'user'", () => {
    const p = new LLMProvider();
    const out = p._normalizeMessages([{ role: "system", content: "x" }]);
    expect(out[0].role).toBe("user");
  });

  test("_normalizeMessages бросает на некорректном вводе", () => {
    const p = new LLMProvider();
    expect(() => p._normalizeMessages(42)).toThrow(TypeError);
  });
});

describe("ClaudeProvider", () => {
  test("isAvailable() = false без ключа", () => {
    const p = new ClaudeProvider({ apiKey: "" });
    expect(p.isAvailable()).toBe(false);
  });

  test("isAvailable() = true с ключом", () => {
    const p = new ClaudeProvider({ apiKey: "sk-test-123" });
    expect(p.isAvailable()).toBe(true);
  });

  test("generateResponse() возвращает null без ключа (не падает)", async () => {
    const p = new ClaudeProvider({ apiKey: "" });
    const answer = await p.generateResponse("привет");
    expect(answer).toBeNull();
  });

  test("использует дефолтную модель и endpoint", () => {
    const p = new ClaudeProvider({ apiKey: "k" });
    expect(p.defaultModel).toMatch(/claude/i);
    expect(p.endpoint).toBe("https://api.anthropic.com/v1/messages");
  });

  test("конфиг переопределяет env-дефолты", () => {
    const p = new ClaudeProvider({
      apiKey: "k",
      model: "claude-opus-4-6",
      endpoint: "https://example.test/v1",
    });
    expect(p.defaultModel).toBe("claude-opus-4-6");
    expect(p.endpoint).toBe("https://example.test/v1");
  });
});

describe("OllamaProvider", () => {
  test("корректно инициализируется с дефолтными параметрами", () => {
    const p = new OllamaProvider();
    expect(p.name).toBe("ollama");
    expect(p.host).toMatch(/127\.0\.0\.1|localhost/);
    expect(p.defaultModel).toBeTruthy();
  });

  test("checkAvailability() возвращает false при недоступном хосте", async () => {
    const p = new OllamaProvider({ host: "http://127.0.0.1:1" }); // заведомо недоступный порт
    const ok = await p.checkAvailability();
    expect(ok).toBe(false);
  });

  test("generateResponse() возвращает null при недоступном сервере", async () => {
    const p = new OllamaProvider({
      host: "http://127.0.0.1:1",
      timeoutMs: 1500,
    });
    // Если пакет ollama не установлен — клиент null, метод вернёт null сразу.
    const res = await p.generateResponse("привет");
    expect(res).toBeNull();
  }, 10000);
});

describe("GigaChatProvider", () => {
  test("isAvailable() = false без credentials", () => {
    const p = new GigaChatProvider({ credentials: "" });
    expect(p.isAvailable()).toBe(false);
  });

  test("isAvailable() = true с credentials", () => {
    const p = new GigaChatProvider({ credentials: "Zm9vOmJhcg==" });
    expect(p.isAvailable()).toBe(true);
  });

  test("собирает credentials из clientId/clientSecret", () => {
    const p = new GigaChatProvider({
      clientId: "foo",
      clientSecret: "bar",
    });
    expect(p.credentials).toBe(Buffer.from("foo:bar").toString("base64"));
  });

  test("generateResponse() возвращает null без credentials", async () => {
    const p = new GigaChatProvider({ credentials: "" });
    const res = await p.generateResponse("привет");
    expect(res).toBeNull();
  });
});

describe("ProviderManager (fallback + статус)", () => {
  function stubProvider(name, { available = true, answer = "ok" } = {}) {
    return {
      name,
      isAvailable: () => available,
      checkAvailability: async () => available,
      generateResponse: async () => answer,
    };
  }

  test("status() возвращает состояние всех провайдеров и primary", async () => {
    const mgr = new ProviderManager({
      primary: "claude",
      providers: {
        claude: stubProvider("claude", { available: true }),
        ollama: stubProvider("ollama", { available: false }),
      },
    });
    const status = await mgr.status();
    expect(status).toMatchObject({ claude: true, ollama: false, primary: "claude" });
  });

  test("generateResponse() использует primary при наличии", async () => {
    const mgr = new ProviderManager({
      primary: "claude",
      providers: {
        claude: stubProvider("claude", { answer: "from-claude" }),
        ollama: stubProvider("ollama", { answer: "from-ollama" }),
      },
    });
    const res = await mgr.generateResponse("hi");
    expect(res).toEqual({ answer: "from-claude", provider: "claude" });
  });

  test("generateResponse() делает fallback на следующий провайдер", async () => {
    const mgr = new ProviderManager({
      primary: "claude",
      providers: {
        claude: stubProvider("claude", { available: false }),
        ollama: stubProvider("ollama", { available: true, answer: "from-ollama" }),
      },
    });
    const res = await mgr.generateResponse("hi");
    expect(res).toEqual({ answer: "from-ollama", provider: "ollama" });
  });

  test("generateResponse() возвращает null когда все недоступны", async () => {
    const mgr = new ProviderManager({
      primary: "claude",
      providers: {
        claude: stubProvider("claude", { available: false }),
        ollama: stubProvider("ollama", { available: false }),
      },
    });
    const res = await mgr.generateResponse("hi");
    expect(res).toEqual({ answer: null, provider: null });
  });

  test("setPrimary() меняет primary и сбрасывает кеш", () => {
    const mgr = new ProviderManager({
      primary: "claude",
      providers: {
        claude: stubProvider("claude"),
        ollama: stubProvider("ollama"),
      },
    });
    expect(mgr.setPrimary("ollama")).toBe("ollama");
    expect(mgr.primaryName).toBe("ollama");
  });

  test("setPrimary() бросает для неизвестного провайдера", () => {
    const mgr = new ProviderManager({
      primary: "claude",
      providers: { claude: stubProvider("claude") },
    });
    expect(() => mgr.setPrimary("gpt9000")).toThrow(/Неизвестный/);
  });
});

describe("Фабрика провайдеров", () => {
  afterEach(() => resetLLMProvider());

  test("REGISTRY содержит зарегистрированные провайдеры", () => {
    expect(REGISTRY.claude).toBeDefined();
    expect(REGISTRY.ollama).toBeDefined();
    expect(REGISTRY.gigachat).toBeDefined();
  });

  test("getLLMProvider() по умолчанию возвращает Claude", () => {
    const prev = process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER;
    try {
      const p = getLLMProvider({ fresh: true });
      expect(p).toBeInstanceOf(ClaudeProvider);
    } finally {
      if (prev !== undefined) process.env.LLM_PROVIDER = prev;
    }
  });

  test("getLLMProvider({provider}) выбирает нужный класс", () => {
    const p = getLLMProvider({ provider: "ollama", fresh: true });
    expect(p).toBeInstanceOf(OllamaProvider);
  });

  test("getLLMProvider() бросает на неизвестном имени", () => {
    expect(() => getLLMProvider({ provider: "unknown-xyz", fresh: true })).toThrow(
      /Неизвестный LLM_PROVIDER/
    );
  });
});
