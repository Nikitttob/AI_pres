const LLMProvider = require("./LLMProvider");
const ClaudeProvider = require("./ClaudeProvider");
const OllamaProvider = require("./OllamaProvider");

/**
 * Реестр доступных провайдеров. Чтобы добавить нового (например, GigaChat),
 * достаточно создать класс-наследник LLMProvider и зарегистрировать его здесь.
 */
const REGISTRY = {
  claude: ClaudeProvider,
  ollama: OllamaProvider,
};

let _cachedProvider = null;
let _cachedKey = null;

/**
 * Фабрика провайдера. Выбор управляется переменной окружения LLM_PROVIDER
 * (значения: "claude" | "ollama"). По умолчанию — "claude" для обратной
 * совместимости с текущим кодом.
 *
 * @param {object} [opts]
 * @param {string} [opts.provider]  — явное имя провайдера, перекрывает env
 * @param {object} [opts.config]    — конфиг, прокидывается в конструктор
 * @param {boolean} [opts.fresh]    — игнорировать кеш и создать новый инстанс
 * @returns {LLMProvider}
 */
function getLLMProvider(opts = {}) {
  const name = (
    opts.provider ||
    process.env.LLM_PROVIDER ||
    "claude"
  ).toLowerCase();

  if (!opts.fresh && _cachedProvider && _cachedKey === name) {
    return _cachedProvider;
  }

  const Cls = REGISTRY[name];
  if (!Cls) {
    const known = Object.keys(REGISTRY).join(", ");
    throw new Error(
      `Неизвестный LLM_PROVIDER="${name}". Доступные: ${known}`
    );
  }

  _cachedProvider = new Cls(opts.config || {});
  _cachedKey = name;
  console.log(`🧠 LLM-провайдер: ${_cachedProvider.name}`);
  return _cachedProvider;
}

/**
 * Сброс кеша (полезно для тестов или горячей смены провайдера).
 */
function resetLLMProvider() {
  _cachedProvider = null;
  _cachedKey = null;
}

module.exports = {
  LLMProvider,
  ClaudeProvider,
  OllamaProvider,
  getLLMProvider,
  resetLLMProvider,
  REGISTRY,
};
