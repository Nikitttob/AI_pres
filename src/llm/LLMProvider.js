/**
 * Базовый абстрактный класс LLM-провайдера.
 *
 * Все конкретные провайдеры (Claude, Ollama, GigaChat, …) обязаны
 * реализовать метод `generateResponse(prompt, options)`.
 *
 * Контракт:
 *   prompt  — строка ИЛИ массив сообщений вида { role: "user"|"assistant", content: string }.
 *   options — объект с опциями вызова:
 *     - systemPrompt {string}  — системный промпт
 *     - maxTokens    {number}  — лимит токенов в ответе (по умолчанию 2000)
 *     - temperature  {number}  — температура (если поддерживается)
 *     - model        {string}  — переопределение модели
 *
 * Возвращает: Promise<string|null> — текст ответа или null при ошибке.
 */
class LLMProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "abstract";
  }

  /**
   * @param {string|Array<{role:string,content:string}>} prompt
   * @param {object} [options]
   * @returns {Promise<string|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async generateResponse(prompt, options = {}) {
    throw new Error(
      `LLMProvider.generateResponse() не реализован в провайдере "${this.name}"`
    );
  }

  /**
   * Признак готовности провайдера (наличие ключей, доступность endpoint и т. п.).
   * Конкретные провайдеры могут переопределить.
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }

  /**
   * Нормализация prompt → массив сообщений Anthropic-совместимого формата.
   * Утилита для подклассов.
   */
  _normalizeMessages(prompt) {
    if (typeof prompt === "string") {
      return [{ role: "user", content: prompt }];
    }
    if (Array.isArray(prompt)) {
      return prompt.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
      }));
    }
    throw new TypeError("prompt должен быть строкой или массивом сообщений");
  }
}

module.exports = LLMProvider;
