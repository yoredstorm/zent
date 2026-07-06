function createOrchestratorHelpers(ctx) {
  const {
    copyLib,
    toolResults,
    message,
    contactPhone,
    chatId,
    stateKey,
    waSessionId,
    store,
    tg,
    customer,
    flow,
    cart,
    reservedMinutes,
    toolCalls,
    keysRef,
  } = ctx;

  function mergeKeys(r) {
    if (r?.lastCopyKeys) Object.assign(keysRef, r.lastCopyKeys);
    return r?.text || '';
  }

  const COPY = copyLib.buildCopy(keysRef);

  function buildWelcomeReply() {
    const gr = customer.found
      ? customer.isReturning
        ? COPY.greetingReturning(customer.name, store, customer.totalOrders)
        : COPY.greetingNamed(customer.name, store, tg)
      : COPY.greetingAnonymous(store, tg);
    return mergeKeys(gr) + '\n\n' + mergeKeys(COPY.mainMenu());
  }

  function buildWelcomePatch() {
    return {
      phase: 'main_menu',
      checkout: {},
      categoryId: undefined,
      categoryName: undefined,
      lastProductList: undefined,
      selectedProductId: undefined,
      productPage: undefined,
      lastCopyKeys: { ...keysRef },
    };
  }

  function productQuantityPrompt() {
    return mergeKeys(COPY.productAskQuantity());
  }

  function buildCheckoutConfirmReply() {
    flow.phase = 'checkout_confirm';
    const address = flow.checkout.address || customer.address || '';
    const reference = flow.checkout.reference || customer.reference || '';
    const reply =
      mergeKeys(COPY.checkoutSummaryIntro()) +
      '\n\n' +
      formatCartSummary(cart) +
      '\n📍 ' +
      address +
      (reference ? '\n📌 ' + reference : '') +
      '\n\nResponde *sí* o *confirmo* para registrar el pedido.';
    const patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: { ...keysRef } };
    return { reply, nextPhase: flow.phase, handoff: false, toolCalls, patch };
  }

  function advanceAfterAddressResolved() {
    flow.checkout.address = flow.checkout.address || customer.address || '';
    if (flow.checkout.useSavedAddress) {
      flow.checkout.reference = flow.checkout.reference || customer.reference || '';
      return buildCheckoutConfirmReply();
    }
    if (customer.reference?.trim() && !flow.checkout.reference) {
      flow.checkout.reference = customer.reference.trim();
      return buildCheckoutConfirmReply();
    }
    flow.phase = 'checkout_reference';
    const reply = mergeKeys(COPY.checkoutAskReference());
    const patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: { ...keysRef } };
    return { reply, nextPhase: flow.phase, handoff: false, toolCalls, patch };
  }

  function buildCartAddResult(match) {
    if (!toolResults['cart.add_item']) {
      toolCalls.push({
        name: 'cart.add_item',
        body: {
          stateKey,
          chatId: stateKey || chatId,
          contactPhone,
          productId: match.product.id,
          quantity: match.quantity,
          customerName: customer.found ? customer.name : undefined,
        },
      });
      const reply = mergeKeys(COPY.lookupFiller());
      const patch = { phase: 'cart', lastCopyKeys: { ...keysRef } };
      return { reply, nextPhase: 'cart', handoff: false, toolCalls, patch };
    }

    if (match.product.imageUrl && !toolResults['products.send_image']) {
      toolCalls.push({
        name: 'products.send_image',
        body: { chatId, waSessionId, productId: match.product.id },
      });
      const reply = mergeKeys(COPY.lookupFiller());
      const patch = { phase: 'cart', lastCopyKeys: { ...keysRef } };
      return { reply, nextPhase: 'cart', handoff: false, toolCalls, patch };
    }

    const c = toolResults['cart.add_item'].cart;
    const reply =
      mergeKeys(COPY.addedToCart(match.product.name, match.quantity, reservedMinutes)) +
      '\n\n' +
      mergeKeys(COPY.cartSummary()) +
      '\n' +
      formatCartSummary(c) +
      '\n\n' +
      mergeKeys(COPY.keepShopping());
    const patch = { phase: 'cart', selectedProductId: undefined, lastCopyKeys: { ...keysRef } };
    return { reply, nextPhase: 'cart', handoff: false, toolCalls: [], patch };
  }

  function showProductDetail(product) {
    flow.phase = 'product_detail';
    flow.selectedProductId = product.id;
    const imageOk =
      toolResults['products.send_image']?.sent &&
      toolResults['products.send_image']?.productId === product.id;
    if (product.imageUrl && !imageOk) {
      toolCalls.push({
        name: 'products.send_image',
        body: {
          chatId,
          waSessionId,
          productId: product.id,
          caption: formatProductImageCaption(product),
        },
      });
      const reply = mergeKeys(COPY.lookupFiller());
      const patch = {
        phase: 'product_detail',
        selectedProductId: product.id,
        lastCopyKeys: { ...keysRef },
      };
      return { reply, nextPhase: flow.phase, handoff: false, toolCalls, patch };
    }
    const reply =
      product.imageUrl
        ? productQuantityPrompt()
        : formatProductDetail(product) + '\n\n' + productQuantityPrompt();
    const patch = {
      phase: 'product_detail',
      selectedProductId: product.id,
      lastCopyKeys: { ...keysRef },
    };
    return { reply, nextPhase: flow.phase, handoff: false, toolCalls, patch };
  }

  return {
    COPY,
    mergeKeys,
    buildWelcomeReply,
    buildWelcomePatch,
    productQuantityPrompt,
    buildCheckoutConfirmReply,
    advanceAfterAddressResolved,
    buildCartAddResult,
    showProductDetail,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { createOrchestratorHelpers };
}
