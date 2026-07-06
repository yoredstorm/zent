/**
 * Cart flow — accepts catálogo, confirmar pedido, resumen.
 * Does NOT interpret bare digits as product selection.
 */
function handleCartFlow(ctx) {
  const { msg, intent, flow, cart, toolResults, toolCalls } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys } = h;
  const { customer } = ctx;
  const handoff = false;
  let reply = '';
  let patch = {};

  if (intent === 'confirm' || /confirmar pedido|finalizar/.test(msg)) {
    if (!cart.items?.length) {
      reply = mergeKeys(COPY.cartEmpty());
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: { ...ctx.keysRef } } };
    }
    flow.checkout = flow.checkout || {};
    if (customer.found && customer.address) {
      flow.phase = 'checkout_address';
      flow.checkout.useSavedAddress = true;
      reply = mergeKeys(COPY.checkoutConfirmSavedAddress(customer.address));
    } else if (!customer.found || !customer.name) {
      flow.phase = 'checkout_name';
      reply = mergeKeys(COPY.checkoutAskName());
    } else {
      flow.phase = 'checkout_address';
      reply = mergeKeys(COPY.checkoutAskAddress());
    }
    patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: { ...ctx.keysRef } };
    return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
  }

  if (intent === 'catalog') {
    const entered = enterBrowseCategories({
      toolResults,
      store: ctx.store,
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

  reply =
    mergeKeys(COPY.cartSummary()) +
    '\n' +
    formatCartSummary(cart) +
    '\n\nDi *confirmar pedido* para finalizar o *catálogo* para seguir comprando.';
  patch = { lastCopyKeys: { ...ctx.keysRef } };
  return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
}

if (typeof module !== 'undefined') {
  module.exports = { handleCartFlow };
}
