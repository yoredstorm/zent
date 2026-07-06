function handleCheckoutFlow(ctx) {
  const { message, msg, intent, flow, cart, toolResults, toolCalls, contactPhone, chatId, waSessionId, stateKey } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys, buildCheckoutConfirmReply, advanceAfterAddressResolved } = h;
  const { customer } = ctx;
  const handoff = false;
  let reply = '';
  let patch = {};

  switch (flow.phase) {
    case 'checkout_name': {
      flow.checkout = flow.checkout || {};
      flow.checkout.customerName = message.trim();
      flow.phase = 'checkout_address';
      if (customer.found && customer.address) {
        flow.checkout.useSavedAddress = true;
        reply = mergeKeys(COPY.checkoutConfirmSavedAddress(customer.address));
      } else {
        reply = mergeKeys(COPY.checkoutAskAddress());
      }
      patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: { ...ctx.keysRef } };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'checkout_address': {
      flow.checkout = flow.checkout || {};
      if (/cambiar/.test(msg)) {
        flow.checkout.useSavedAddress = false;
        flow.checkout.address = undefined;
        reply = mergeKeys(COPY.checkoutAskAddress());
        patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: { ...ctx.keysRef } };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      if (
        isSavedAddressConfirmation(msg, customer) ||
        (isAffirmative(msg) && flow.checkout.useSavedAddress && customer.address)
      ) {
        flow.checkout.useSavedAddress = true;
        flow.checkout.address = customer.address;
        return advanceAfterAddressResolved();
      }
      if (!isAffirmative(msg) && message.trim().length > 2) {
        flow.checkout.address = message.trim();
        flow.checkout.useSavedAddress = false;
        return advanceAfterAddressResolved();
      }
      if (customer.found && customer.address) {
        flow.checkout.useSavedAddress = true;
        reply = mergeKeys(COPY.checkoutConfirmSavedAddress(customer.address));
      } else {
        reply = mergeKeys(COPY.checkoutAskAddress());
      }
      patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: { ...ctx.keysRef } };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'checkout_reference': {
      flow.checkout = flow.checkout || {};
      if (!/^no$|^nop|^ninguna|^-$/.test(msg)) {
        flow.checkout.reference = message.trim();
      }
      return buildCheckoutConfirmReply();
    }

    case 'checkout_confirm': {
      flow.checkout = flow.checkout || {};
      if (intent === 'confirm' || isAffirmative(msg)) {
        const custName = flow.checkout.customerName || (customer.found ? customer.name : 'Cliente');
        const address = flow.checkout.address || customer.address || '';
        const reference = flow.checkout.reference || customer.reference || '';
        toolCalls.push({
          name: 'orders.create_from_chat',
          body: {
            chatId,
            waSessionId,
            customerName: custName,
            customerPhone: contactPhone,
            address,
            reference,
            items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          },
        });
        if (toolResults['orders.create_from_chat']) {
          const ord = toolResults['orders.create_from_chat'];
          toolCalls.push({ name: 'cart.clear', body: { stateKey } });
          reply =
            mergeKeys(COPY.orderConfirmed(ord.orderId)) + '\n\n' + mergeKeys(COPY.goodbyeSoft());
          flow.phase = 'main_menu';
          patch = { phase: 'main_menu', checkout: {}, lastCopyKeys: { ...ctx.keysRef } };
          return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
        }
        reply = mergeKeys(COPY.lookupFiller());
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: { ...ctx.keysRef } } };
      }
      reply =
        mergeKeys(COPY.checkoutSummaryIntro()) +
        '\n\n' +
        formatCartSummary(cart) +
        '\n📍 ' +
        (flow.checkout.address || customer.address || '(sin dirección)') +
        '\n\nResponde *sí* o *confirmo* para registrar el pedido.';
      patch = { phase: 'checkout_confirm', checkout: flow.checkout, lastCopyKeys: { ...ctx.keysRef } };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    default:
      flow.phase = 'checkout_name';
      return handleCheckoutFlow(ctx);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { handleCheckoutFlow };
}
