function handleMenuFlow(ctx) {
  const { intent, flow, toolResults, toolCalls, input, customer, store, tg } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys, buildWelcomeReply, buildWelcomePatch } = h;
  let reply = '';
  let patch = {};
  const handoff = false;
  const media = [];

  if (intent === 'order_status') {
    flow.phase = 'order_status';
    return handleOrderStatusFlow(ctx);
  }
  if (intent === 'cart') {
    flow.phase = 'cart';
    return handleCartFlow(ctx);
  }
  if (intent === 'catalog_pdf') {
    toolCalls.push({ name: 'catalog_pdf.send', body: { chatId: ctx.chatId, waSessionId: ctx.waSessionId } });
    if (toolResults['catalog_pdf.send']?.sent) {
      reply = mergeKeys(COPY.catalogPdfSent());
    } else if (toolResults['catalog_pdf.send']) {
      reply = mergeKeys(COPY.catalogPdfUnavailable());
    } else {
      reply = mergeKeys(COPY.lookupFiller());
    }
    patch = { phase: 'main_menu', lastCopyKeys: { ...ctx.keysRef } };
    return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch, media: [] };
  }
  if (intent === 'greeting' || flow.phase === 'greeting') {
    const gr = customer.found
      ? customer.isReturning
        ? COPY.greetingReturning(customer.name, store, customer.totalOrders)
        : COPY.greetingNamed(customer.name, store, tg)
      : COPY.greetingAnonymous(store, tg);
    reply = mergeKeys(gr) + '\n\n' + mergeKeys(COPY.mainMenu());
    flow.phase = 'main_menu';
    patch = { phase: 'main_menu', lastCopyKeys: { ...ctx.keysRef } };
    return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
  }
  if (intent === 'catalog') {
    const entered = enterBrowseCategories({
      toolResults,
      store,
      COPY,
      mergeKeys,
      keys: ctx.keysRef,
      flow,
    });
    if (entered.needsTool) {
      toolCalls.push({ name: 'categories.list', body: {} });
    }
    reply = entered.reply;
    patch = entered.patch;
    flow.phase = 'browse_categories';
    return { reply, nextPhase: 'browse_categories', handoff, toolCalls, patch };
  }
  if (intent === 'freeform') {
    reply = buildWelcomeReply();
    patch = buildWelcomePatch();
    return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch };
  }
  const grFallback = customer.found
    ? customer.isReturning
      ? COPY.greetingReturning(customer.name, store, customer.totalOrders)
      : COPY.greetingNamed(customer.name, store, tg)
    : COPY.greetingAnonymous(store, tg);
  reply = mergeKeys(grFallback) + '\n\n' + mergeKeys(COPY.mainMenu());
  flow.phase = 'main_menu';
  patch = { phase: 'main_menu', lastCopyKeys: { ...ctx.keysRef } };
  return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
}

if (typeof module !== 'undefined') {
  module.exports = { handleMenuFlow };
}
