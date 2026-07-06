/**
 * Catalog flow: browse_categories, browse_products, product_detail.
 * Numbers 1/2/3 are interpreted ONLY in these phases.
 */
function handleCatalogFlow(ctx) {
  const { message, msg, intent, flow, toolResults, toolCalls, input } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys, buildWelcomeReply, buildWelcomePatch, productQuantityPrompt, buildCartAddResult, showProductDetail } = h;
  const handoff = false;
  let reply = '';
  let patch = {};

  switch (flow.phase) {
    case 'browse_categories': {
      const cats =
        toolResults['categories.list']?.categories || input.categories || flow.categoryList || [];
      if (intent === 'catalog') {
        const entered = enterBrowseCategories({
          toolResults,
          store: ctx.store,
          COPY,
          mergeKeys,
          keys: ctx.keysRef,
          flow,
        });
        if (entered.needsTool && !toolCalls.length) {
          toolCalls.push({ name: 'categories.list', body: {} });
        }
        reply = entered.reply;
        patch = entered.patch;
        flow.phase = 'browse_categories';
        return { reply, nextPhase: 'browse_categories', handoff, toolCalls, patch };
      }
      if (!cats.length && !toolCalls.length) {
        toolCalls.push({ name: 'categories.list', body: {} });
        reply = mergeKeys(COPY.lookupFiller());
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: { ...ctx.keysRef } } };
      }
      const cat = fuzzyMatchCategory(msg, cats);
      if (!cat) {
        if (isGreetingLike(msg) || intent === 'freeform') {
          reply = buildWelcomeReply();
          patch = buildWelcomePatch();
          return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch };
        }
        reply = mergeKeys(COPY.didntUnderstand()) + '\n\n' + mergeKeys(COPY.mainMenu());
        patch = { phase: 'main_menu', lastCopyKeys: { ...ctx.keysRef } };
        return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch };
      }
      toolCalls.push({ name: 'products.by_category', body: { categoryId: cat.id } });
      flow.categoryId = cat.id;
      flow.categoryName = cat.name;
      flow.phase = 'browse_products';
      if (toolResults['products.by_category']) {
        const products = toolResults['products.by_category'].products || [];
        flow.lastProductList = products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          lowStock: p.lowStock,
          imageUrl: p.imageUrl,
          description: p.description || null,
        }));
        flow.productPage = 0;
        const fmt = formatProductList(products, 0);
        reply =
          mergeKeys(COPY.productsIntro(cat.name)) +
          '\n\n' +
          fmt.text +
          (fmt.hasMore ? '\n\n' + mergeKeys(COPY.paginationMore()) : '') +
          '\n\nEscribe el *número* para ver un producto, su nombre, o *agregar 2* para añadir directo.';
        patch = {
          phase: 'browse_products',
          categoryId: cat.id,
          categoryName: cat.name,
          lastProductList: flow.lastProductList,
          productPage: 0,
          lastCopyKeys: { ...ctx.keysRef },
        };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      reply = mergeKeys(COPY.lookupFiller());
      patch = { phase: 'browse_products', categoryId: cat.id, categoryName: cat.name, lastCopyKeys: { ...ctx.keysRef } };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'browse_products': {
      let list = flow.lastProductList || [];
      if (!list.length && toolResults['products.by_category']?.products) {
        const products = toolResults['products.by_category'].products || [];
        flow.lastProductList = products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          lowStock: p.lowStock,
          imageUrl: p.imageUrl,
          description: p.description || null,
        }));
        flow.productPage = 0;
        list = flow.lastProductList;
        const fmt = formatProductList(products, 0);
        reply =
          mergeKeys(COPY.productsIntro(flow.categoryName || 'catálogo')) +
          '\n\n' +
          fmt.text +
          (fmt.hasMore ? '\n\n' + mergeKeys(COPY.paginationMore()) : '') +
          '\n\nEscribe el *número* para ver un producto, su nombre, o *agregar 2* para añadir directo.';
        patch = {
          phase: 'browse_products',
          categoryId: flow.categoryId,
          categoryName: flow.categoryName,
          lastProductList: flow.lastProductList,
          productPage: 0,
          lastCopyKeys: { ...ctx.keysRef },
        };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      if (isDirectAddMessage(message)) {
        const addMatch = fuzzyMatchProduct(message, list);
        if (addMatch) return buildCartAddResult(addMatch);
      }
      const picked = resolveProductPick(message, list);
      if (!picked) {
        reply = mergeKeys(COPY.productNotFound());
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: { ...ctx.keysRef } } };
      }
      if (
        picked.imageUrl &&
        toolResults['products.send_image']?.sent &&
        toolResults['products.send_image']?.productId === picked.id
      ) {
        flow.phase = 'product_detail';
        flow.selectedProductId = picked.id;
        reply = productQuantityPrompt();
        patch = { phase: 'product_detail', selectedProductId: picked.id, lastCopyKeys: { ...ctx.keysRef } };
        return { reply, nextPhase: flow.phase, handoff, toolCalls: [], patch };
      }
      return showProductDetail(picked);
    }

    case 'product_detail': {
      const list = flow.lastProductList || [];
      const current = list.find((p) => p.id === flow.selectedProductId);

      if (/^0$|^volver$|^lista$/.test(msg)) {
        flow.phase = 'browse_products';
        const fmt = formatProductList(list, flow.productPage || 0);
        reply =
          mergeKeys(COPY.productsIntro(flow.categoryName || 'catálogo')) +
          '\n\n' +
          fmt.text +
          '\n\nEscribe el *número* para ver un producto, su nombre, o *agregar 2* para añadir directo.';
        patch = { phase: 'browse_products', selectedProductId: undefined, lastCopyKeys: { ...ctx.keysRef } };
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
        patch = { ...entered.patch, selectedProductId: undefined };
        flow.phase = 'browse_categories';
        return { reply, nextPhase: 'browse_categories', handoff, toolCalls, patch };
      }

      const otherPick = resolveProductPick(message, list);
      if (otherPick && otherPick.id !== flow.selectedProductId && !parseQuantityMessage(message)) {
        return showProductDetail(otherPick);
      }

      const qty = parseQuantityMessage(message);
      if (qty > 0 && current) {
        return buildCartAddResult({ product: current, quantity: qty });
      }

      if (
        current &&
        toolResults['products.send_image']?.sent &&
        toolResults['products.send_image']?.productId === current.id
      ) {
        reply = productQuantityPrompt();
        patch = { phase: 'product_detail', selectedProductId: current.id, lastCopyKeys: { ...ctx.keysRef } };
        return { reply, nextPhase: flow.phase, handoff, toolCalls: [], patch };
      }

      reply = current
        ? formatProductDetail(current) + '\n\n' + productQuantityPrompt()
        : mergeKeys(COPY.productNotFound());
      patch = { phase: 'product_detail', lastCopyKeys: { ...ctx.keysRef } };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    default:
      flow.phase = 'browse_categories';
      return handleCatalogFlow(ctx);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { handleCatalogFlow };
}
