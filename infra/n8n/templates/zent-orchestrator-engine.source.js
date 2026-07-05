/** Zent WhatsApp orchestrator state machine — versioned source for n8n Code node. */

const STATUS_ES = {
  NUEVO: 'Recibido',
  EN_GESTION: 'En preparación',
  CONFIRMADO: 'Confirmado',
  EN_DELIVERY: 'En camino',
  COMPLETADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

function normalizeInput(message) {
  return String(message || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*_~`]/g, '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^\w]+|[^\w]+$/g, '');
}

function isGreetingLike(msg) {
  if (!msg || msg.length < 2) return true;
  if (/^(hola|buenas|buenos|hey|hi|hello|saludos|que tal|ola)[\s!.?,]*$/.test(msg)) return true;
  if (msg.length <= 30 && /\b(hola|buenas|buenos|hey|saludos)\b/.test(msg)) return true;
  return false;
}

function detectGlobalIntent(msg) {
  if (/^(menu|inicio|empezar de nuevo|volver al inicio)/.test(msg)) return 'reset';
  if (isGreetingLike(msg) || msg.length < 3) return 'greeting';
  if (/asesor|humano|persona|agente|hablar con/.test(msg)) return 'handoff';
  if (/pedido|estado|seguimiento|donde esta|donde está|mi compra/.test(msg)) return 'order_status';
  if (/pdf|catalogo completo|catálogo completo|catalogo pdf|catálogo pdf|ver pdf/.test(msg)) {
    return 'catalog_pdf';
  }
  if (/catalogo|catálogo|productos|comprar|venta|ver productos|^1$/.test(msg)) return 'catalog';
  if (/carrito|ver carrito|mi carrito/.test(msg)) return 'cart';
  if (/confirmar|confirmo|finalizar|checkout|^si$|^sí$|^ok$|^dale$/.test(msg)) return 'confirm';
  if (/^no$|^nop|cambiar/.test(msg)) return 'no';
  if (/^\d+$/.test(msg)) return 'number';
  return 'freeform';
}

function fuzzyMatchCategory(name, categories) {
  const n = normalizeInput(name);
  const byNum = parseInt(n, 10);
  if (!isNaN(byNum) && byNum >= 1 && byNum <= categories.length) {
    return categories[byNum - 1];
  }
  return (
    categories.find((c) => normalizeInput(c.name).includes(n) || n.includes(normalizeInput(c.name))) ||
    null
  );
}

function fuzzyMatchProduct(text, lastProductList) {
  if (!lastProductList?.length) return null;
  let msg = normalizeInput(text).replace(/^(agrega(r)?|anade|anadir|pon(me)?|quiero)\s+/, '');
  const qtyMatch = msg.match(/(\d+)\s*(.+)?/);
  let qty = 1;
  let rest = msg;
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1], 10) || 1;
    rest = (qtyMatch[2] || '').trim();
  }
  if (/^\d+$/.test(msg) && lastProductList.length === 1) {
    return { product: lastProductList[0], quantity: parseInt(msg, 10) || 1 };
  }
  const byNum = parseInt(rest || '', 10);
  if (rest && !isNaN(byNum) && byNum >= 1 && byNum <= lastProductList.length && !rest.match(/[a-z]/)) {
    return { product: lastProductList[byNum - 1], quantity: qty };
  }
  if (/^\d+$/.test(rest) && lastProductList.length === 1) {
    return { product: lastProductList[0], quantity: byNum };
  }
  if (/primero|1ro/.test(msg)) return { product: lastProductList[0], quantity: qty };
  if (/segundo|2do/.test(msg)) return { product: lastProductList[1], quantity: qty };
  if (!rest && lastProductList.length === 1) {
    return { product: lastProductList[0], quantity: qty };
  }
  if (rest) {
    const found = lastProductList.find(
      (p) => normalizeInput(p.name).includes(rest) || rest.includes(normalizeInput(p.name)),
    );
    if (found) return { product: found, quantity: qty };
  }
  return null;
}

function formatKeycap(n) {
  const caps = { 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', 10: '🔟' };
  return caps[n] ?? `${n}.`;
}

function formatProductList(products, page = 0, pageSize = 8) {
  const slice = products.slice(page * pageSize, (page + 1) * pageSize);
  const lines = slice.map((p, i) => {
    const idx = page * pageSize + i + 1;
    const name = p.lowStock ? `*${p.name}*` : p.name;
    return `${formatKeycap(idx)} ${name} — S/ ${Number(p.price).toFixed(2)}`;
  });
  const hasMore = products.length > (page + 1) * pageSize;
  return { text: lines.join('\n'), hasMore, page };
}

function formatCartSummary(cart) {
  if (!cart?.items?.length) return '';
  const lines = cart.items.map(
    (i) => `• ${i.quantity}x ${i.nombre} — S/ ${(i.quantity * i.unitPrice).toFixed(2)}`,
  );
  lines.push(`\nSubtotal: S/ ${Number(cart.subtotal).toFixed(2)}`);
  if (cart.deliveryCost > 0) lines.push(`Delivery: S/ ${Number(cart.deliveryCost).toFixed(2)}`);
  lines.push(`*Total: S/ ${Number(cart.total).toFixed(2)}*`);
  return lines.join('\n');
}

function looksLikeOrderId(msg) {
  return /^[a-f0-9-]{6,}$/i.test(msg.trim()) || /^#?[a-f0-9]{6,8}$/i.test(msg.trim());
}

function productImageMedia(product, caption) {
  if (!product?.imageUrl) return [];
  return [
    {
      type: 'image',
      url: product.imageUrl,
      caption:
        caption || `*${product.name}* — S/ ${Number(product.price).toFixed(2)}`,
    },
  ];
}

/**
 * Main orchestrator — returns { reply, nextPhase, handoff, toolCalls, patch, media }
 * toolCalls: [{ name, body }] executed externally when http helper provided
 */
function runOrchestrator(input, copyLib, toolResults = {}) {
  const { message, session, contactPhone, chatId, stateKey, waSessionId } = input;
  const msg = normalizeInput(message);
  const intent = detectGlobalIntent(msg);
  const lastKeys = session?.flow?.lastCopyKeys || {};
  let keys = { ...lastKeys };
  const COPY = copyLib.buildCopy(keys);
  const store = session?.storeName || 'Zent';
  const tg = copyLib.timeGreeting(session?.localHour);
  const customer = session?.customer || { found: false };
  const flow = { ...(session?.flow || { phase: 'greeting' }) };
  const cart = session?.cart || { items: [], total: 0 };
  const reservedMinutes = session?.cartTtlMinutes || 30;
  const toolCalls = [];
  let reply = '';
  let handoff = false;
  let patch = {};
  let media = [];

  function mergeKeys(r) {
    if (r?.lastCopyKeys) keys = { ...keys, ...r.lastCopyKeys };
    return r?.text || '';
  }

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
      productPage: undefined,
      lastCopyKeys: keys,
    };
  }

  const checkoutPhases = ['checkout_name', 'checkout_address', 'checkout_reference', 'checkout_confirm'];

  if (intent === 'reset') {
    reply = buildWelcomeReply();
    patch = buildWelcomePatch();
    return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch, media };
  }

  // Saludo o mensaje corto amigable → siempre bienvenida + menú (excepto checkout)
  if (
    (intent === 'greeting' || (flow.phase === 'main_menu' && intent === 'freeform' && msg.length <= 40)) &&
    !checkoutPhases.includes(flow.phase)
  ) {
    reply = buildWelcomeReply();
    patch = buildWelcomePatch();
    return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch, media };
  }

  if (intent === 'catalog_pdf' && !checkoutPhases.includes(flow.phase)) {
    toolCalls.push({ name: 'catalog_pdf.active', body: {} });
    if (toolResults['catalog_pdf.active']?.available) {
      const pdf = toolResults['catalog_pdf.active'];
      reply = mergeKeys(COPY.catalogPdfSent());
      media = [
        {
          type: 'document',
          url: pdf.url,
          mimetype: 'application/pdf',
          caption: '📋 Catálogo completo',
        },
      ];
    } else if (toolResults['catalog_pdf.active']) {
      reply = mergeKeys(COPY.catalogPdfUnavailable());
    } else {
      reply = mergeKeys(COPY.lookupFiller());
    }
    patch = { phase: 'main_menu', lastCopyKeys: keys };
    return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch, media };
  }

  if (intent === 'handoff' || flow.phase === 'handoff') {
    handoff = true;
    flow.phase = 'handoff';
    toolCalls.push({
      name: 'chat.handoff',
      body: { chatId: stateKey || chatId, contactPhone, waSessionId },
    });
    reply = mergeKeys(COPY.handoff());
    return { reply, nextPhase: 'handoff', handoff, toolCalls, patch: { phase: 'handoff', lastCopyKeys: keys } };
  }

  switch (flow.phase) {
    case 'greeting':
    case 'main_menu': {
      if (intent === 'order_status') {
        flow.phase = 'order_status';
        break;
      }
      if (intent === 'cart') {
        flow.phase = 'cart';
        break;
      }
      if (intent === 'catalog_pdf') {
        toolCalls.push({ name: 'catalog_pdf.active', body: {} });
        if (toolResults['catalog_pdf.active']?.available) {
          const pdf = toolResults['catalog_pdf.active'];
          reply = mergeKeys(COPY.catalogPdfSent());
          media = [
            {
              type: 'document',
              url: pdf.url,
              mimetype: 'application/pdf',
              caption: '📋 Catálogo completo',
            },
          ];
        } else if (toolResults['catalog_pdf.active']) {
          reply = mergeKeys(COPY.catalogPdfUnavailable());
        } else {
          reply = mergeKeys(COPY.lookupFiller());
        }
        patch = { phase: 'main_menu', lastCopyKeys: keys };
        return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch, media };
      }
      // Saludo cálido primero — "hola" NO debe saltar directo al catálogo
      if (intent === 'greeting' || flow.phase === 'greeting') {
        const gr = customer.found
          ? customer.isReturning
            ? COPY.greetingReturning(customer.name, store, customer.totalOrders)
            : COPY.greetingNamed(customer.name, store, tg)
          : COPY.greetingAnonymous(store, tg);
        reply = mergeKeys(gr) + '\n\n' + mergeKeys(COPY.mainMenu());
        flow.phase = 'main_menu';
        patch = { phase: 'main_menu', lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      // Catálogo solo cuando lo piden explícitamente (catálogo, comprar, etc.)
      if (intent === 'catalog') {
        toolCalls.push({ name: 'categories.list', body: {} });
        flow.phase = 'browse_categories';
        if (toolResults['categories.list']) {
          const cats = toolResults['categories.list'].categories || [];
          reply =
            mergeKeys(COPY.catalogWelcome(store)) +
            '\n\n' +
            mergeKeys(COPY.categoriesIntro()) +
            '\n\n' +
            cats.map((c, i) => `${formatKeycap(i + 1)} ${c.name}`).join('\n');
        } else {
          reply = mergeKeys(COPY.lookupFiller());
        }
        patch = {
          phase: 'browse_categories',
          categoryList: (toolResults['categories.list']?.categories || []).map((c) => ({
            id: c.id,
            name: c.name,
            productCount: c.productCount,
          })),
          lastCopyKeys: keys,
        };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
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
      patch = { phase: 'main_menu', lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'browse_categories': {
      const cats =
        toolResults['categories.list']?.categories || input.categories || flow.categoryList || [];
      if (!cats.length && !toolCalls.length) {
        toolCalls.push({ name: 'categories.list', body: {} });
        reply = mergeKeys(COPY.lookupFiller());
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: keys } };
      }
      const cat = fuzzyMatchCategory(msg, cats);
      if (!cat) {
        if (isGreetingLike(msg) || intent === 'freeform') {
          reply = buildWelcomeReply();
          patch = buildWelcomePatch();
          return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch };
        }
        reply =
          mergeKeys(COPY.didntUnderstand()) +
          '\n\n' +
          mergeKeys(COPY.mainMenu());
        patch = { phase: 'main_menu', lastCopyKeys: keys };
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
        }));
        flow.productPage = 0;
        const fmt = formatProductList(products, 0);
        reply =
          mergeKeys(COPY.productsIntro(cat.name)) +
          '\n\n' +
          fmt.text +
          (fmt.hasMore ? '\n\n' + mergeKeys(COPY.paginationMore()) : '') +
          '\n\nEscribe el *número* o *"agregar 2 arroz"*';
        patch = {
          phase: 'browse_products',
          categoryId: cat.id,
          categoryName: cat.name,
          lastProductList: flow.lastProductList,
          productPage: 0,
          lastCopyKeys: keys,
        };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      reply = mergeKeys(COPY.lookupFiller());
      patch = { phase: 'browse_products', categoryId: cat.id, categoryName: cat.name, lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'browse_products': {
      const match = fuzzyMatchProduct(message, flow.lastProductList);
      if (match && toolResults['cart.add_item']) {
        const c = toolResults['cart.add_item'].cart;
        reply =
          mergeKeys(COPY.addedToCart(match.product.name, match.quantity, reservedMinutes)) +
          '\n\n' +
          mergeKeys(COPY.cartSummary()) +
          '\n' +
          formatCartSummary(c) +
          '\n\nDi *confirmar pedido* para finalizar o *catálogo* para seguir comprando.';
        media = productImageMedia(match.product);
        patch = { phase: 'cart', lastCopyKeys: keys };
        return { reply, nextPhase: 'cart', handoff, toolCalls: [], patch, media };
      }
      if (match) {
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
        flow.phase = 'cart';
        if (toolResults['cart.add_item']) {
          const c = toolResults['cart.add_item'].cart;
          reply =
            mergeKeys(COPY.addedToCart(match.product.name, match.quantity, reservedMinutes)) +
            '\n\n' +
            mergeKeys(COPY.cartSummary()) +
            '\n' +
            formatCartSummary(c) +
            '\n\nDi *confirmar pedido* para finalizar o *catálogo* para seguir comprando.';
          media = productImageMedia(match.product);
        } else {
          reply = mergeKeys(COPY.lookupFiller());
        }
        patch = { phase: 'cart', lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch, media };
      }
      reply = mergeKeys(COPY.productNotFound());
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: keys } };
    }

    case 'cart': {
      if (intent === 'confirm' || /confirmar pedido|finalizar/.test(msg)) {
        if (!cart.items?.length) {
          reply = mergeKeys(COPY.cartEmpty());
          return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: keys } };
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
        patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      if (intent === 'catalog') {
        flow.phase = 'browse_categories';
        toolCalls.push({ name: 'categories.list', body: {} });
        reply = mergeKeys(COPY.lookupFiller());
        patch = { phase: 'browse_categories', lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      reply =
        mergeKeys(COPY.cartSummary()) +
        '\n' +
        formatCartSummary(cart) +
        '\n\nDi *confirmar pedido* para finalizar o *catálogo* para seguir comprando.';
      patch = { lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'checkout_name': {
      flow.checkout = flow.checkout || {};
      flow.checkout.customerName = message.trim();
      flow.phase = 'checkout_address';
      if (customer.found && customer.address) {
        reply = mergeKeys(COPY.checkoutConfirmSavedAddress(customer.address));
      } else {
        reply = mergeKeys(COPY.checkoutAskAddress());
      }
      patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'checkout_address': {
      flow.checkout = flow.checkout || {};
      if (intent === 'confirm' && flow.checkout.useSavedAddress && customer.address) {
        flow.checkout.address = customer.address;
        flow.phase = 'checkout_reference';
        reply = mergeKeys(COPY.checkoutAskReference());
        patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      if (/cambiar/.test(msg)) {
        flow.checkout.useSavedAddress = false;
        reply = mergeKeys(COPY.checkoutAskAddress());
        patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      if (!flow.checkout.address) {
        flow.checkout.address = message.trim();
        flow.phase = 'checkout_reference';
        reply = mergeKeys(COPY.checkoutAskReference());
        patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
      }
      flow.phase = 'checkout_confirm';
      reply =
        mergeKeys(COPY.checkoutSummaryIntro()) +
        '\n\n' +
        formatCartSummary(cart) +
        '\n📍 ' +
        flow.checkout.address +
        '\n\nResponde *sí* o *confirmo* para registrar el pedido.';
      patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'checkout_reference': {
      flow.checkout = flow.checkout || {};
      if (!/^no$|^nop|^ninguna|^-$/.test(msg)) {
        flow.checkout.reference = message.trim();
      }
      flow.phase = 'checkout_confirm';
      reply =
        mergeKeys(COPY.checkoutSummaryIntro()) +
        '\n\n' +
        formatCartSummary(cart) +
        '\n📍 ' +
        (flow.checkout.address || customer.address || '') +
        (flow.checkout.reference ? '\n📌 ' + flow.checkout.reference : '') +
        '\n\nResponde *sí* o *confirmo* para registrar el pedido.';
      patch = { phase: flow.phase, checkout: flow.checkout, lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'checkout_confirm': {
      flow.checkout = flow.checkout || {};
      if (intent === 'confirm') {
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
            mergeKeys(COPY.orderConfirmed(ord.orderId)) +
            '\n\n' +
            mergeKeys(COPY.goodbyeSoft());
          flow.phase = 'main_menu';
          patch = { phase: 'main_menu', checkout: {}, lastCopyKeys: keys };
          return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
        }
        reply = mergeKeys(COPY.lookupFiller());
        return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: keys } };
      }
      reply =
        mergeKeys(COPY.checkoutSummaryIntro()) +
        '\n\n' +
        formatCartSummary(cart) +
        '\n📍 ' +
        (flow.checkout.address || customer.address || '(sin dirección)') +
        '\n\nResponde *sí* o *confirmo* para registrar el pedido.';
      patch = { phase: 'checkout_confirm', checkout: flow.checkout, lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    case 'order_status': {
      if (looksLikeOrderId(message)) {
        const id = message.replace(/^#/, '').trim();
        toolCalls.push({ name: 'orders.get_status', body: { orderId: id, customerPhone: contactPhone } });
        if (toolResults['orders.get_status']) {
          const o = toolResults['orders.get_status'];
          reply = mergeKeys(COPY.orderStatus(STATUS_ES[o.status] || o.status, o.shortId));
        } else if (toolResults['orders.get_status'] === null) {
          reply = mergeKeys(COPY.orderNotFound());
        } else {
          reply = mergeKeys(COPY.lookupFiller());
        }
      } else {
        toolCalls.push({ name: 'orders.find_active_by_phone', body: { customerPhone: contactPhone } });
        if (toolResults['orders.find_active_by_phone']?.found) {
          const o = toolResults['orders.find_active_by_phone'].order;
          reply = mergeKeys(COPY.orderStatus(STATUS_ES[o.status] || o.status, o.shortId));
        } else if (toolResults['orders.find_active_by_phone']) {
          reply = mergeKeys(COPY.noActiveOrder());
        } else {
          reply = mergeKeys(COPY.lookupFiller());
        }
      }
      flow.phase = 'main_menu';
      patch = { phase: 'main_menu', lastCopyKeys: keys };
      return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
    }

    default:
      flow.phase = 'greeting';
      reply = mergeKeys(COPY.mainMenu());
      patch = { phase: 'main_menu', lastCopyKeys: keys };
      return { reply, nextPhase: 'main_menu', handoff, toolCalls, patch };
  }

  reply = mergeKeys(COPY.didntUnderstand());
  return { reply, nextPhase: flow.phase, handoff, toolCalls, patch: { lastCopyKeys: keys } };
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeInput,
    isGreetingLike,
    detectGlobalIntent,
    fuzzyMatchCategory,
    fuzzyMatchProduct,
    formatProductList,
    formatCartSummary,
    runOrchestrator,
    STATUS_ES,
  };
}
