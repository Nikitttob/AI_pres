// ═══════════════════════════════════════════════
// Абстрактный базовый класс для LLM-провайдеров
// ═══════════════════════════════════════════════
// Все конкретные провайдеры (Claude, Ollama, GigaChat)
// должны наследоваться от этого класса и реализовать
// методы generate() и isAvailable().

class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "base";
  }

  /**
   * Генерирует ответ модели.
   * @param {string} systemPrompt - системный промпт
   * @param {Array<{role: string, content: string}>} messages - история сообщений
   * @returns {Promise<string|null>} текст ответа или null при ошибке
   */
  async generate(systemPrompt, messages) {
    throw new Error(`${this.constructor.name}.generate() не реализован`);
  }

  /**
   * Проверяет, доступен ли провайдер (API-ключ, сервер, модель).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error(`${this.constructor.name}.isAvailable() не реализован`);
  }
}

module.exports = BaseProvider;
