/** Zent WhatsApp orchestrator — Node entry loads modules into global scope then exports router. */
function loadGlobal(relPath) {
  Object.assign(global, require(relPath));
}

loadGlobal('./shared/zent-intent.source.js');
loadGlobal('./shared/zent-product-utils.source.js');
loadGlobal('./shared/zent-flow-patch.source.js');
loadGlobal('./shared/zent-catalog-render.source.js');
loadGlobal('./shared/zent-orchestrator-helpers.source.js');
loadGlobal('./flows/zent-flow-order-status.source.js');
loadGlobal('./flows/zent-flow-checkout.source.js');
loadGlobal('./flows/zent-flow-cart.source.js');
loadGlobal('./flows/zent-flow-catalog.source.js');
loadGlobal('./flows/zent-flow-menu.source.js');
require('./zent-orchestrator-router.source.js');

module.exports = {
  normalizeInput,
  isGreetingLike,
  detectGlobalIntent,
  isAffirmative,
  isSavedAddressConfirmation,
  looksLikeOrderId,
  fuzzyMatchCategory,
  fuzzyMatchProduct,
  resolveProductPick,
  isDirectAddMessage,
  parseQuantityMessage,
  formatProductDetail,
  formatProductImageCaption,
  formatKeycap,
  formatProductList,
  formatCartSummary,
  applyFlowPatch,
  renderCategoryListResponse,
  enterBrowseCategories,
  createOrchestratorHelpers,
  handleMenuFlow,
  handleCatalogFlow,
  handleCartFlow,
  handleCheckoutFlow,
  handleOrderStatusFlow,
  handleHandoffFlow,
  runOrchestrator: globalThis.runOrchestrator,
  STATUS_ES,
  PHASE_HANDLER: globalThis.PHASE_HANDLER,
  checkoutPhases: globalThis.checkoutPhases,
  browsePhases: globalThis.browsePhases,
};
