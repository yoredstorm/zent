const copySrc = require('./zent-copy-variants.source.js');
const engine = require('./zent-orchestrator-engine.source.js');

const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

const customer = {
  found: true,
  name: 'Pablo',
  address: 'Av. Principal 123',
  reference: 'Paradero el pozo',
  isReturning: true,
  totalOrders: 2,
};

const baseSession = {
  storeName: 'ohana',
  customer,
  cart: {
    items: [{ productId: 'p2', nombre: 'regla', quantity: 3, unitPrice: 30 }],
    subtotal: 90,
    deliveryCost: 0,
    total: 90,
  },
  cartTtlMinutes: 30,
};

function run(message, flow, toolResults = {}) {
  return engine.runOrchestrator(
    {
      message,
      session: { ...baseSession, flow },
      contactPhone: '51987752653',
      chatId: '51987752653@lid',
      stateKey: 'sess::51987752653@lid',
      waSessionId: 'sess',
    },
    copyLib,
    toolResults,
  );
}

// "si" must be confirm, not greeting
if (engine.detectGlobalIntent('si') !== 'confirm') {
  console.error('FAIL si intent:', engine.detectGlobalIntent('si'));
  process.exit(1);
}

// Saved address + si → skip reference, go to confirm
const addrConfirm = run('si', {
  phase: 'checkout_address',
  checkout: { useSavedAddress: true },
});
if (addrConfirm.nextPhase !== 'checkout_confirm') {
  console.error('FAIL saved address confirm phase:', addrConfirm.nextPhase);
  process.exit(1);
}
if (!addrConfirm.reply.includes('Paradero el pozo')) {
  console.error('FAIL should include saved reference:', addrConfirm.reply);
  process.exit(1);
}
if (addrConfirm.reply.includes('referencia') || addrConfirm.reply.includes('repartidor')) {
  console.error('FAIL should not ask reference again:', addrConfirm.reply);
  process.exit(1);
}

// checkout_confirm + si → create order
const orderConfirm = run(
  'si',
  {
    phase: 'checkout_confirm',
    checkout: {
      address: 'Av. Principal 123',
      reference: 'Paradero el pozo',
      customerName: 'Pablo',
    },
  },
  {},
);
if (!orderConfirm.toolCalls.some((t) => t.name === 'orders.create_from_chat')) {
  console.error('FAIL si at checkout_confirm should create order:', orderConfirm.toolCalls);
  process.exit(1);
}

// Product with image: follow-up is quantity only (no repeated price line)
const products = [
  {
    id: 'p1',
    name: 'papel grueso',
    price: 50,
    description: 'Papel bond grueso A4',
    imageUrl: '/img.jpg',
  },
];
const afterImage = run(
  '1',
  { phase: 'browse_products', categoryName: 'oficina', lastProductList: products },
  { 'products.send_image': { sent: true, productId: 'p1' } },
);
if (afterImage.reply.includes('S/ 50.00')) {
  console.error('FAIL should not repeat price after image caption:', afterImage.reply);
  process.exit(1);
}

console.log('OK checkout and product UX tests');
