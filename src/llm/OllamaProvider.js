const LLMProvider = require("./LLMProvider");

/**
 * Заглушка-провайдер для локальной Ollama (по умолчанию http://localhost:11434).
 *
 * Реализован базовый вызов /api/chat — рабочий, если Ollama запущена локально
 * и нужная модель уже скачана (`ollama pull llama3.1`). Если сервер недоступен,
 * метод возвращает null и пишет ошибку в лог — вызывающий код корректно уйдёт
 * в offline-fallback (как сейчас работает с Claude).
 *
 * Конфигурируется переменными окружения:
 *   OLLAMA_HOST       (default: http://localhost:11434)
 *   OLLAMA_MODEL      (default: llama3.1)
 */
class OllamaProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "ollama";
    this.host =
      config.host || process.env.OLLAMA_HOST || "http://localhost:11434";
    this.defaultModel =
      config.model || process.env.OLLAMA_MODEL || "llama3.1";
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  isAvailable() {
    // На уровне фабрики предполагаем, что провайдер доступен, если выбран явно.
    // Реальная проверка живости будет при первом вызове generateResponse().
    return true;
  }

  async generateResponse(prompt, options = {}) {
    const messages = this._normalizeMessages(prompt);
    if (options.systemPrompt) {
      messages.unshift({ role: "system", content: options.systemPrompt });
    }

    const body = {
      model: options.model || this.defaultModel,
      messages,
      stream: false,
      options: {
        num_predict: options.maxTokens ?? 2000,
        ...(typeof options.temperature === "number"
          ? { temperature: options.temperature }
          : {}),
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error(
          `[OllamaProvider] HTTP ${res.status} ${res.statusText} от ${this.host}`
        );
        return null;
      }

      const data = await res.json();
      // Ответ Ollama: { message: { role: "assistant", content: "..." }, ... }
      return data?.message?.content || null;
    } catch (err) {
      if (err.name === "AbortError") {
        console.error(
          `[OllamaProvider] Таймаут ${this.timeoutMs} мс при обращении к ${this.host}`
        );
      } else {
        console.error("[OllamaProvider] Fetch error:", err.message);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = OllamaProvider;
