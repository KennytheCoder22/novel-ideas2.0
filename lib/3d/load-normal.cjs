// Keep native import() in JavaScript: the API TypeScript is emitted as CommonJS.
// This also works when the runtime disables synchronous require(ESM).
exports.processNormalSymmetry = async function processNormalSymmetry(input) {
  const normal = await import('./normal.mjs');
  return normal.processNormalSymmetry(input);
};
