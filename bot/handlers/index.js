// ═══════════════════════════════════════════════
// Реестр хендлеров режимов.
// Чтобы добавить новый режим — создайте файл в /bot/handlers/
// и зарегистрируйте его здесь.
// ═══════════════════════════════════════════════
const zhkh = require("./zhkh");
const economics = require("./economics");
const travel = require("./travel");
const market = require("./market");
const presentation = require("./presentation");

const REGISTRY = { zhkh, economics, travel, market, presentation };

/**
 * Инстанцирует хендлеры всех режимов с общими зависимостями.
 * @param {import('./_base').HandlerDeps} deps
 * @returns {Record<string, (chatId:number, text:string)=>Promise<void>>}
 */
function buildHandlers(deps) {
  const out = {};
  for (const [id, mod] of Object.entries(REGISTRY)) {
    out[id] = mod.build(deps);
  }
  return out;
}

module.exports = { REGISTRY, buildHandlers };
