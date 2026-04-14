// Хендлер режима «Презентации»
const { MODES } = require("../modes");
const { createRagHandler } = require("./_base");

const config = MODES.presentation;

module.exports = {
  id: config.id,
  config,
  build: (deps) => createRagHandler(config, deps),
};
