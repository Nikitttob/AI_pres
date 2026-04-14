# AI-мультиассистент

Мультирежимный AI-ассистент (ЖКХ, Экономика, Путешествия, Анализ рынка,
Презентации) с поддержкой Telegram-бота, RAG по JSON-базам знаний и
переключаемыми LLM-провайдерами: **Claude API**, **Ollama** и
**Sber GigaChat**.

## Стек

- Node.js ≥ 18 + Express
- Telegram Bot API
- RAG на JSON-базах (`data/kb_*.json`)
- LLM-провайдеры: Anthropic Claude, Ollama (локальный), Sber GigaChat
- Тесты: Jest
- Деплой: Railway

## Режимы

1. ЖКХ и Право
2. Экономика
3. Путешествия
4. Анализ рынка
5. Презентации

## Установка

```bash
npm install
cp .env.example .env
# отредактируйте .env, заполнив ANTHROPIC_API_KEY и/или OLLAMA_*
npm start
```

Сервер поднимется на `http://localhost:3000`.

## LLM-провайдеры и fallback

Основной провайдер задаётся переменной `LLM_PROVIDER`
(`claude` | `ollama` | `gigachat`). Если основной недоступен — менеджер
автоматически переключается на резервный (порядок: primary → остальные).

Primary можно менять на лету через `POST /api/llm/primary`
(или из веб-интерфейса в сайдбаре).

Статус провайдеров — `GET /health`:

```json
{
  "status": "ok",
  "providers": {
    "claude": true,
    "ollama": false,
    "gigachat": false,
    "primary": "claude"
  }
}
```

## Запуск с Ollama

[Ollama](https://ollama.com) — локальный сервер LLM. Работает
офлайн, не требует API-ключей и не отправляет данные в облако
(важно для работы с внутренними данными).

### 1. Установите Ollama

- **macOS / Windows:** скачайте установщик с <https://ollama.com/download>
- **Linux:** `curl -fsSL https://ollama.com/install.sh | sh`

### 2. Запустите сервер Ollama

```bash
ollama serve
```

По умолчанию слушает `http://127.0.0.1:11434`.

### 3. Скачайте модель

```bash
# Быстрая универсальная модель
ollama pull llama3

# Или более качественная (если хватает RAM/VRAM)
ollama pull llama3.1:8b
ollama pull qwen2.5:7b
```

### 4. Настройте `.env`

```env
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
# Claude можно оставить как fallback:
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Запустите приложение

```bash
npm start
```

Если Ollama-сервер недоступен в момент запроса (не запущен, модель не
загружена, таймаут) — сервер автоматически переключится на Claude API
при наличии `ANTHROPIC_API_KEY`. Сценарий в логах:

```
[ProviderManager] ollama недоступен, пробуем следующий...
[ProviderManager] Fallback: ответ получен от claude
```

### Удалённый Ollama

Если Ollama развёрнута на отдельной машине:

```env
OLLAMA_HOST=http://192.168.1.10:11434
OLLAMA_MODEL=llama3.1:8b
```

Убедитесь, что Ollama слушает на внешнем интерфейсе
(`OLLAMA_HOST=0.0.0.0 ollama serve`).

## Структура

```
.
├── server.js                     # Express API + точка входа
├── index.html                    # веб-интерфейс (single-page)
├── bot/                          # Telegram-бот
│   ├── index.js                  #   точка входа: команды, callback'и, dispatch
│   ├── modes.js                  #   конфигурация 5 режимов (system prompts, examples)
│   ├── keyboards.js              #   inline-клавиатуры
│   ├── state.js                  #   in-memory история и режим пользователя
│   ├── handlers/                 #   per-mode хендлеры (createRagHandler-фабрика)
│   └── middleware/               #   logger + errorHandler (graceful)
├── src/
│   ├── llm/
│   │   ├── LLMProvider.js        # абстрактный класс
│   │   ├── ClaudeProvider.js     # Anthropic Claude
│   │   ├── OllamaProvider.js     # локальный Ollama (npm `ollama`)
│   │   ├── GigaChatProvider.js   # Sber GigaChat (OAuth2 + REST)
│   │   ├── ProviderManager.js    # fallback между провайдерами
│   │   └── index.js              # фабрики getLLMProvider / getLLMManager
│   ├── rag/search.js             # лексический скоринг по KB
│   └── middleware/rateLimit.js   # in-memory rate-limiter для /api/*
├── data/                         # JSON-базы знаний (~171 Q&A)
│   └── kb_*.json
├── tests/                        # Jest-тесты (RAG, LLM, KB)
├── railway.json                  # конфиг деплоя
└── .env.example
```

## Тесты

```bash
npm test
```

Покрытие: парсинг и валидность KB, токенизация и RAG-поиск, контракт
`LLMProvider`, fallback в `ProviderManager`, фабрики провайдеров.

## Добавление нового провайдера

1. Создайте класс, наследующий `LLMProvider`, в `src/llm/`.
2. Реализуйте `generateResponse(prompt, options)` и `isAvailable()`
   (плюс `checkAvailability()`, если нужен сетевой ping).
3. Зарегистрируйте его в `REGISTRY` (`src/llm/index.js`) и в
   `ProviderManager` (`src/llm/ProviderManager.js`).

## Ограничения

- Не загружайте внутренние/конфиденциальные данные через Claude API.
  Для таких сценариев используйте локальный Ollama или GigaChat
  с корпоративным скоупом.
- Качество ответов в режиме Ollama напрямую зависит от выбранной модели.
- Состояние Telegram-бота (история, режим) — in-memory; при рестарте
  обнуляется. Для продакшена нужен внешний store (Redis/SQLite).
