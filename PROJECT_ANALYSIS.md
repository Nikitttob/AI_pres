# Краткий анализ проекта AI_pres

## 1) Структура файлов и папок
- `server.js` — единая точка входа: HTTP API, загрузка KB, инициализация LLM-менеджера, запуск Telegram-бота, graceful shutdown.
- `bot/` — Telegram-слой:
  - `modes.js` — декларативный конфиг режимов (id, prompt, kbFile и пр.).
  - `handlers/` — обработчики режимов и общая фабрика RAG-хендлера.
  - `state.js` — in-memory состояние чатов и история.
  - `middleware/` — логирование и обработка ошибок.
- `src/` — серверные модули:
  - `llm/` — абстракция и реализации провайдеров (Claude/Ollama/GigaChat) + fallback-менеджер.
  - `rag/search.js` — токенизация и лексический поиск по KB.
  - `routes/knowledge.js` — CRUD и AI-генерация Q&A для KB.
  - `middleware/rateLimit.js` — in-memory rate limit.
- `kb_*.json` — базы знаний по режимам.
- `tests/` — unit/integration-подобные тесты для RAG/LLM/KB.

## 2) Зависимости (package.json)
- Runtime:
  - `express`, `cors` — HTTP API и CORS.
  - `node-telegram-bot-api` — Telegram polling-бот.
  - `ollama` — клиент локального Ollama-сервера.
- Dev:
  - `jest` — тесты.

## 3) Как организован RAG-пайплайн
1. При старте по `MODES` загружаются `kbFile` в in-memory `knowledgeBases`.
2. На запрос (`/api/chat` или Telegram handler) вызывается `search(modeId, query, subMode)`.
3. `src/rag/search.js`:
   - токенизация запроса/документов,
   - simple lexical scoring (exact/prefix/includes),
   - сортировка по `score`, top-N.
4. Найденные Q&A вставляются в `contextBlock` и отправляются в LLM вместе с системным промптом режима.
5. При недоступности LLM возвращается оффлайн-ответ из найденных KB-результатов (если они есть).

## 4) Как устроена маршрутизация режимов бота
- Единый источник конфигурации режимов — `bot/modes.js`.
- `bot/handlers/index.js` держит реестр хендлеров по mode id.
- Текущий mode хранится в `bot/state.js` на chat id.
- Маршрутизация:
  - команды `/mode`, `/mode_<id>`;
  - callback data `mode:<id>` из inline-клавиатур;
  - обычное сообщение → `dispatch()` → хендлер текущего режима.

## 5) Архитектурные проблемы и улучшения
Проблемы:
1. **In-memory state/лимитеры/KB-кэш**: при рестарте теряются данные сессий; при горизонтальном масштабировании поведение расходится.
2. **Сильная роль `server.js`**: точка входа содержит много ответственности (env, API, загрузка KB, бот, shutdown).
3. **Простой retrieval**: lexical matching без эмбеддингов/ранжирования, что ограничивает релевантность.
4. **Непоследовательность контрактов сообщений** (`history` в web использует `text`, в боте — `content`), повышает риск ошибок интеграции.
5. **Нет строгих схем валидации API** (например, через zod/joi), много ручных проверок.
6. **Синхронные FS-операции** в request-path (knowledge CRUD), потенциальные блокировки event loop.

Рекомендации:
1. Вынести состояние и rate-limit в Redis.
2. Разделить `server.js` на модули: bootstrap/config, http-app, bot-runtime.
3. Улучшить RAG: BM25 + embeddings + reranker; добавить порог релевантности и дедупликацию источников.
4. Ввести единый контракт сообщений и DTO-слой между web/bot/llm.
5. Добавить schema validation и централизованный error mapping.
6. Перевести FS-операции в async + очереди/батчинг для массовых KB-обновлений.
