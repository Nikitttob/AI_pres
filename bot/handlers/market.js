// Хендлер режима «Анализ рынка»
const { MODES } = require("../modes");
const { createRagHandler } = require("./_base");

const config = MODES.market;

module.exports = {
  id: config.id,
  config,
  build: (deps) => createRagHandler(config, deps),
};
