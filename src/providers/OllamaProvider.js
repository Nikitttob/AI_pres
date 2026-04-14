const BaseProvider = require("./BaseProvider");

// ═══════════════════════════════════════════════
// Провайдер Ollama (локальный LLM-сервер)
// ═══════════════════════════════════════════════
// Использует npm-пакет `ollama`. Подключение ленивое —
// если пакет не установлен, провайдер просто будет
// недоступен (isAvailable() вернёт false).

class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = "ollama";
    this.host = config.host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    this.model = config.model || process.env.OLLAMA_MODEL || "llama3";
    this.timeout = config.timeout || 60000;

    this.client = null;
    try {
      // Пакет подгружается лениво, чтобы отсутствие зависимости
      // не ломало запуск сервера.
      const { Ollama } = require("ollama");
      this.client = new Ollama({ host: this.host });
    } catch (err) {
      console.warn("[OllamaProvider] Пакет 'ollama' не установлен:", err.message);
      this.client = null;
    }
  }

  async isAvailable() {
    if (!this.client) return false;
    try {
      // Ping — запрос списка моделей. Если сервер поднят и отвечает — ок.
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.host}/api/tags`, { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      return true;
    } catch (err) {
      return false;
    }
  }

  async generate(systemPrompt, messages) {
    if (!this.client) return null;

    // Ollama использует единый массив messages, включая system-роль
    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    try {
      const res = await this.client.chat({
        model: this.model,
        messages: fullMessages,
        stream: false,
      });
      return res?.message?.content || null;
    } catch (err) {
      console.error("[OllamaProvider] Ошибка генерации:", err.message);
      return null;
    }
  }
}

module.exports = OllamaProvider;
