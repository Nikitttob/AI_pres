// Хендлер режима «Путешествия»
const { MODES } = require("../modes");
const { createRagHandler } = require("./_base");

const config = MODES.travel;

module.exports = {
  id: config.id,
  config,
  build: (deps) => createRagHandler(config, deps),
};
