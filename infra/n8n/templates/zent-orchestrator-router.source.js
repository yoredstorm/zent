/** Zent WhatsApp orchestrator — thin router dispatches by active flow phase. */

const PHASE_HANDLER = {
  greeting: handleMenuFlow,
  main_menu: handleMenuFlow,
  browse_categories: handleCatalogFlow,
  browse_products: handleCatalogFlow,
  product_detail: handleCatalogFlow,
  cart: handleCartFlow,
  checkout_name: handleCheckoutFlow,
  checkout_address: handleCheckoutFlow,
  checkout_reference: handleCheckoutFlow,
  checkout_confirm: handleCheckoutFlow,
  order_status: handleOrderStatusFlow,
  handoff: handleHandoffFlow,
};

const checkoutPhases = ['checkout_name', 'checkout_address', 'checkout_reference', 'checkout_confirm'];
const browsePhases = ['browse_categories', 'browse_products', 'product_detail'];

function buildCtx(input, copyLib, toolResults) {
  const { message, session, contactPhone, chatId, stateKey, waSessionId } = input;
  const msg = normalizeInput(message);
  const intent = detectGlobalIntent(msg);
  const keysRef = { ...(session?.flow?.lastCopyKeys || {}) };
  const toolCalls = [];
  const flow = { ...(session?.flow || { phase: 'greeting' }) };
  const ctx = {
    input,
    copyLib,
    toolResults,
    message,
    msg,
    intent,
    session,
    contactPhone,
    chatId,
    stateKey,
    waSessionId,
    store: session?.storeName || 'Zent',
    tg: copyLib.timeGreeting(session?.localHour),
    customer: session?.customer || { found: false },
    flow,
    cart: session?.cart || { items: [], total: 0 },
    reservedMinutes: session?.cartTtlMinutes || 30,
    keysRef,
    toolCalls,
    media: [],
  };
  ctx.helpers = createOrchestratorHelpers(ctx);
  return ctx;
}

/**
 * Main orchestrator — returns { reply, nextPhase, handoff, toolCalls, patch, media }
 */
function runOrchestrator(input, copyLib, toolResults = {}) {
  const ctx = buildCtx(input, copyLib, toolResults);
  const { msg, intent, flow, toolCalls } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys, buildWelcomeReply, buildWelcomePatch } = h;
  let media = [];

  if (intent === 'reset') {
    const reply = buildWelcomeReply();
    const patch = buildWelcomePatch();
    return { reply, nextPhase: 'main_menu', handoff: false, toolCalls, patch, media };
  }

  if (
    (intent === 'greeting' || (flow.phase === 'main_menu' && intent === 'freeform' && msg.length <= 40)) &&
    !checkoutPhases.includes(flow.phase) &&
    !browsePhases.includes(flow.phase)
  ) {
    const reply = buildWelcomeReply();
    const patch = buildWelcomePatch();
    return { reply, nextPhase: 'main_menu', handoff: false, toolCalls, patch, media };
  }

  if (intent === 'catalog_pdf' && !checkoutPhases.includes(flow.phase)) {
    toolCalls.push({ name: 'catalog_pdf.send', body: { chatId: ctx.chatId, waSessionId: ctx.waSessionId } });
    let reply;
    if (toolResults['catalog_pdf.send']?.sent) {
      reply = mergeKeys(COPY.catalogPdfSent());
    } else if (toolResults['catalog_pdf.send']) {
      reply = mergeKeys(COPY.catalogPdfUnavailable());
    } else {
      reply = mergeKeys(COPY.lookupFiller());
    }
    const patch = { phase: 'main_menu', lastCopyKeys: { ...ctx.keysRef } };
    return { reply, nextPhase: 'main_menu', handoff: false, toolCalls, patch, media: [] };
  }

  if (intent === 'handoff' || flow.phase === 'handoff') {
    return handleHandoffFlow(ctx);
  }

  const phase = flow.phase || 'greeting';
  const handler = PHASE_HANDLER[phase] || handleMenuFlow;
  const result = handler(ctx);

  if (!result.reply && !result.toolCalls?.length) {
    const reply = mergeKeys(COPY.didntUnderstand());
    return { reply, nextPhase: flow.phase, handoff: false, toolCalls, patch: { lastCopyKeys: { ...ctx.keysRef } } };
  }

  return { ...result, media: result.media || media };
}

if (typeof globalThis !== 'undefined') {
  globalThis.runOrchestrator = runOrchestrator;
  globalThis.PHASE_HANDLER = PHASE_HANDLER;
  globalThis.checkoutPhases = checkoutPhases;
  globalThis.browsePhases = browsePhases;
}

