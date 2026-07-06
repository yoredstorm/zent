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

/** Selección por número o nombre para *ver* un producto (sin cantidad). */
function resolveProductPick(text, lastProductList) {
  if (!lastProductList?.length) return null;
  const msg = normalizeInput(text);
  if (/^\d+$/.test(msg)) {
    const idx = parseInt(msg, 10);
    if (idx >= 1 && idx <= lastProductList.length) return lastProductList[idx - 1];
    return null;
  }
  return (
    lastProductList.find(
      (p) => normalizeInput(p.name).includes(msg) || msg.includes(normalizeInput(p.name)),
    ) || null
  );
}

function isDirectAddMessage(text) {
  const msg = normalizeInput(text);
  return (
    /^(agrega(r)?|anade|anadir|pon(me)?|quiero)\s+/.test(msg) ||
    /^\d+\s+[a-z]/.test(msg)
  );
}

function parseQuantityMessage(text) {
  const msg = normalizeInput(text).replace(/^(agrega(r)?|anade|anadir|pon(me)?|quiero)\s+/, '');
  if (/^\d+$/.test(msg)) return parseInt(msg, 10) || 0;
  const m = msg.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function formatProductDetail(product, opts = {}) {
  const { skipHeader = false } = opts;
  let text = skipHeader ? '' : `*${product.name}*\n💰 Precio: S/ ${Number(product.price).toFixed(2)}`;
  if (product.description?.trim()) {
    text += (text ? '\n' : '') + `📝 ${product.description.trim()}`;
  }
  if (product.lowStock) text += '\n⚠️ *¡Quedan pocas unidades!*';
  return text;
}

function formatProductImageCaption(product) {
  let cap = `*${product.name}*\n💰 S/ ${Number(product.price).toFixed(2)}`;
  if (product.description?.trim()) {
    const desc = product.description.trim();
    cap += `\n📝 ${desc.length > 120 ? desc.slice(0, 117) + '…' : desc}`;
  }
  if (product.lowStock) cap += '\n⚠️ *¡Quedan pocas unidades!*';
  return cap;
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

if (typeof module !== 'undefined') {
  module.exports = {
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
  };
}
