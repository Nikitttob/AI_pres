const LLMProvider = require("./LLMProvider");

/**
 * Провайдер локального Ollama-сервера (по умолчанию http://127.0.0.1:11434).
 *
 * Использует npm-пакет `ollama` (подгружается лениво — если пакет не
 * установлен, провайдер просто отметится недоступным и вызывающий код
 * уйдёт в fallback).
 *
 * Конфигурируется переменными окружения:
 *   OLLAMA_HOST       (default: http://127.0.0.1:11434)
 *   OLLAMA_MODEL      (default: llama3)
 */
class OllamaProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "ollama";
    this.host =
      config.host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    this.defaultModel =
      config.model || process.env.OLLAMA_MODEL || "llama3";
    this.timeoutMs = config.timeoutMs ?? 60_000;

    // Ленивая инициализация клиента: отсутствие пакета не должно ломать сервер.
    this.client = null;
    try {
      const { Ollama } = require("ollama");
      this.client = new Ollama({ host: this.host });
    } catch (err) {
      console.warn("[OllamaProvider] Пакет 'ollama' не установлен:", err.message);
    }
  }

  /**
   * Синхронный признак (для совместимости с базовым контрактом).
   * true, если npm-пакет установлен. Реальная живость — checkAvailability().
   */
  isAvailable() {
    return !!this.client;
  }

  /**
   * Асинхронная проверка доступности сервера — пинг /api/tags с таймаутом.
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    if (!this.client) return false;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.host}/api/tags`, { signal: controller.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateResponse(prompt, options = {}) {
    if (!this.client) {
      console.error("[OllamaProvider] Клиент Ollama не инициализирован");
      return null;
    }

    const messages = this._normalizeMessages(prompt);
    if (options.systemPrompt) {
      messages.unshift({ role: "system", content: options.systemPrompt });
    }

    const req = {
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

    // Ручной таймаут поверх клиента.
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Таймаут ${this.timeoutMs} мс`)),
        this.timeoutMs
      );
    });

    try {
      const res = await Promise.race([this.client.chat(req), timeoutPromise]);
      return res?.message?.content || null;
    } catch (err) {
      console.error("[OllamaProvider] Ошибка генерации:", err.message);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

module.exports = OllamaProvider;
