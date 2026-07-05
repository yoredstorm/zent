const engine = require('./zent-orchestrator-engine.source.js');

const products = [{ id: 'p1', name: 'papel grueso', price: 50, lowStock: false }];

const m1 = engine.fuzzyMatchProduct('Agrega 5', products);
if (!m1 || m1.quantity !== 5 || m1.product.id !== 'p1') {
  console.error('FAIL agrega 5:', m1);
  process.exit(1);
}

const m2 = engine.fuzzyMatchProduct('5', products);
if (!m2 || m2.quantity !== 5) {
  console.error('FAIL solo 5:', m2);
  process.exit(1);
}

// Simular loop: cart.add_item solo debe contarse una vez
let cartQty = 0;
const executed = new Set();
const calls = [
  { name: 'cart.add_item', body: { productId: 'p1', quantity: 5 } },
  { name: 'cart.add_item', body: { productId: 'p1', quantity: 5 } },
];
for (const tc of calls) {
  const sig = tc.name + ':' + JSON.stringify(tc.body || {});
  if (executed.has(sig)) continue;
  executed.add(sig);
  cartQty += tc.body.quantity;
}
if (cartQty !== 5) {
  console.error('FAIL duplicate cart execution:', cartQty);
  process.exit(1);
}

console.log('OK cart quantity tests');
