const copySrc = require('./zent-copy-variants.source.js');
const engine = require('./zent-orchestrator-engine.source.js');

const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

function run(message, sessionFlow = { phase: 'browse_categories' }) {
  return engine.runOrchestrator(
    {
      message,
      session: {
        storeName: 'Mi Tienda',
        customer: { found: false },
        flow: sessionFlow,
        cart: { items: [], total: 0 },
        cartTtlMinutes: 30,
      },
      contactPhone: '51999999999',
      chatId: 'chat1',
      stateKey: 'sess::chat1',
    },
    copyLib,
    { 'categories.list': { categories: [{ id: '1', name: 'oficina', productCount: 1 }] } },
  );
}

const holaStuck = run('hola', { phase: 'browse_categories' });
if (!holaStuck.reply.includes('Mi Tienda') || holaStuck.reply.includes('No me quedó claro')) {
  console.error('FAIL hola in browse_categories:', holaStuck.reply);
  process.exit(1);
}

const holaMenu = run('hola', { phase: 'main_menu' });
if (!holaMenu.reply.includes('¿En qué te ayudo') && !holaMenu.reply.includes('catálogo')) {
  console.error('FAIL hola in main_menu:', holaMenu.reply);
  process.exit(1);
}

const holaProducts = run('hola', {
  phase: 'browse_products',
  categoryName: 'oficina',
  lastProductList: [{ id: 'p1', name: 'papel', price: 10 }],
});
if (holaProducts.reply.includes('producto no lo ubico') || !holaProducts.reply.includes('Mi Tienda')) {
  console.error('FAIL hola in browse_products:', holaProducts.reply);
  process.exit(1);
}

const markdown = run('*hola*', { phase: 'main_menu' });
if (markdown.reply.includes('No me quedó claro')) {
  console.error('FAIL *hola* markdown:', markdown.reply);
  process.exit(1);
}

console.log('OK orchestrator greeting tests');
console.log('Sample:', holaStuck.reply.split('\n').slice(0, 3).join(' | '));
