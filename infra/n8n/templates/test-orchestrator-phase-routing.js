const engine = require('./zent-orchestrator-engine.source.js');

const products = [
  { id: 'p1', name: 'papel', price: 10 },
  { id: 'p2', name: 'lapiz', price: 5 },
];
const categories = [
  { id: 'c1', name: 'oficina', productCount: 2 },
  { id: 'c2', name: 'arte', productCount: 3 },
];

// browse_products: "1" selects product #1
const picked = engine.resolveProductPick('1', products);
if (!picked || picked.id !== 'p1') {
  console.error('FAIL: resolveProductPick should pick p1, got', picked);
  process.exit(1);
}

// browse_categories: "1" selects category #1
const cat = engine.fuzzyMatchCategory('1', categories);
if (!cat || cat.id !== 'c1') {
  console.error('FAIL: fuzzyMatchCategory should pick c1, got', cat);
  process.exit(1);
}

// cart: "1" is NOT product selection — shows cart summary
const copySrc = require('./zent-copy-variants.source.js');
const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

const cartResult = engine.runOrchestrator(
  {
    message: '1',
    session: {
      storeName: 'ohana',
      flow: { phase: 'cart' },
      cart: {
        items: [{ productId: 'p1', nombre: 'papel', quantity: 2, unitPrice: 10 }],
        subtotal: 20,
        total: 20,
      },
    },
    contactPhone: '519',
    chatId: 'x',
    stateKey: 's::x',
  },
  copyLib,
  {},
);

if (cartResult.nextPhase !== 'cart') {
  console.error('FAIL: cart phase should stay cart, got', cartResult.nextPhase);
  process.exit(1);
}
if (!/confirmar pedido|catálogo/i.test(cartResult.reply)) {
  console.error('FAIL: cart should show summary, got:', cartResult.reply);
  process.exit(1);
}
if (/papel.*S\/ 10/i.test(cartResult.reply) === false && !/papel/i.test(cartResult.reply)) {
  console.error('FAIL: cart summary should mention product');
  process.exit(1);
}

console.log('OK phase routing');
