const copySrc = require('./zent-copy-variants.source.js');
const engine = require('./zent-orchestrator-engine.source.js');

const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

const products = [
  { id: 'p1', name: 'papel grueso', price: 50, lowStock: false, imageUrl: '/api/uploads/images/p1.jpg' },
  { id: 'p2', name: 'regla', price: 30, lowStock: false, imageUrl: null },
];

// "1" no debe ser saludo
if (engine.detectGlobalIntent('1') !== 'number') {
  console.error('FAIL intent for 1:', engine.detectGlobalIntent('1'));
  process.exit(1);
}

const pick = engine.resolveProductPick('1', products);
if (!pick || pick.id !== 'p1') {
  console.error('FAIL resolveProductPick 1:', pick);
  process.exit(1);
}

const pickName = engine.resolveProductPick('papel', products);
if (!pickName || pickName.id !== 'p1') {
  console.error('FAIL resolveProductPick name:', pickName);
  process.exit(1);
}

const session = {
  flow: { phase: 'browse_products', lastProductList: products, categoryName: 'oficina' },
  cart: { items: [], total: 0 },
  customer: { found: true, name: 'Pablo', isReturning: true, totalOrders: 2 },
  storeName: 'ohana',
};

const r1 = engine.runOrchestrator(
  {
    message: '1',
    session,
    contactPhone: '51987752653',
    chatId: '51987752653@lid',
    stateKey: 'sess::51987752653@lid',
    waSessionId: 'sess',
  },
  copyLib,
  {},
);

if (!r1.toolCalls.some((t) => t.name === 'products.send_image')) {
  console.error('FAIL should request product image:', r1);
  process.exit(1);
}

const r2 = engine.runOrchestrator(
  {
    message: '1',
    session,
    contactPhone: '51987752653',
    chatId: '51987752653@lid',
    stateKey: 'sess::51987752653@lid',
    waSessionId: 'sess',
  },
  copyLib,
  { 'products.send_image': { sent: true, productId: 'p1' } },
);

if (r2.patch.phase !== 'product_detail') {
  console.error('FAIL phase product_detail:', r2.patch);
  process.exit(1);
}
if (r2.reply.includes('S/ 50.00') || r2.reply.includes('papel grueso')) {
  console.error('FAIL should not repeat product header after image:', r2.reply);
  process.exit(1);
}
if (!/cantidad|cuántas|unidades/i.test(r2.reply)) {
  console.error('FAIL should ask quantity:', r2.reply);
  process.exit(1);
}

const sessionDetail = {
  ...session,
  flow: { ...session.flow, phase: 'product_detail', selectedProductId: 'p1', lastProductList: products },
};

const r3 = engine.runOrchestrator(
  {
    message: '3',
    session: sessionDetail,
    contactPhone: '51987752653',
    chatId: '51987752653@lid',
    stateKey: 'sess::51987752653@lid',
    waSessionId: 'sess',
  },
  copyLib,
  {},
);

if (!r3.toolCalls.some((t) => t.name === 'cart.add_item' && t.body.quantity === 3)) {
  console.error('FAIL should add 3 to cart:', r3.toolCalls);
  process.exit(1);
}

console.log('OK product pick flow tests');
