const copySrc = require('./zent-copy-variants.source.js');
const engine = require('./zent-orchestrator-engine.source.js');

const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

async function simulateOficina() {
  const baseSession = {
    storeName: 'ohana',
    customer: { found: false },
    flow: {
      phase: 'browse_categories',
      categoryList: [{ id: 'cat-1', name: 'oficina', productCount: 1 }],
    },
    cart: { items: [], total: 0 },
    cartTtlMinutes: 30,
  };

  const toolResults = {};
  let mergedSession = { ...baseSession };
  const message = 'Oficina';

  const orchInput = () => ({
    message,
    session: mergedSession,
    contactPhone: '51999999999',
    chatId: 'chat1',
    stateKey: 'sess::chat1',
  });

  let result = engine.runOrchestrator(orchInput(), copyLib, toolResults);

  function isLookupFiller(text) {
    return /segundito|momentito|Voy a mirarlo/i.test(String(text || ''));
  }

  for (let round = 0; round < 6; round++) {
    const calls = result.toolCalls || [];
    if (!calls.length) break;

    for (const tc of calls) {
      if (tc.name === 'products.by_category') {
        toolResults[tc.name] = {
          products: [
            { id: 'p1', name: 'Lapicero', price: 5, lowStock: false },
            { id: 'p2', name: 'Cuaderno', price: 12, lowStock: true, stock: 2 },
          ],
        };
      } else {
        toolResults[tc.name] = { categories: baseSession.flow.categoryList };
      }
    }

    const next = engine.runOrchestrator(orchInput(), copyLib, toolResults);
    result = next;
    if (!(next.toolCalls || []).length && !isLookupFiller(next.reply)) break;
  }

  if (/segundito|momentito|Voy a mirarlo/i.test(result.reply)) {
    console.error('FAIL: stuck on filler:', result.reply);
    process.exit(1);
  }
  if (!/Lapicero|Cuaderno|oficina/i.test(result.reply)) {
    console.error('FAIL: missing products:', result.reply);
    process.exit(1);
  }
  console.log('OK category -> products flow');
  console.log('Sample:', result.reply.split('\n').slice(0, 4).join(' | '));
}

simulateOficina();
