const copySrc = require('./zent-copy-variants.source.js');
const engine = require('./zent-orchestrator-engine.source.js');
const { applyFlowPatch } = require('./shared/zent-flow-patch.source.js');

const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

function simulateCartCatalogLoop(applyPatch) {
  const toolResults = {};
  let mergedSession = {
    storeName: 'ohana',
    customer: { found: true, name: 'Pablo' },
    flow: { phase: 'cart' },
    cart: {
      items: [{ productId: 'p1', nombre: 'papel grueso', quantity: 5, unitPrice: 50 }],
      subtotal: 250,
      total: 250,
    },
    cartTtlMinutes: 30,
  };
  const orchInput = () => ({
    message: 'Catalogo',
    session: mergedSession,
    contactPhone: '51987752653',
    chatId: 'x',
    stateKey: 's::x',
  });

  let result = engine.runOrchestrator(orchInput(), copyLib, toolResults);
  for (let round = 0; round < 6; round++) {
    const calls = result.toolCalls || [];
    if (!calls.length) break;
    for (const tc of calls) {
      if (tc.name === 'categories.list') {
        toolResults[tc.name] = { categories: [{ id: 'c1', name: 'oficina', productCount: 2 }] };
      }
    }
    if (applyPatch && result.patch) {
      mergedSession = applyFlowPatch(mergedSession, result.patch);
    }
    result = engine.runOrchestrator(orchInput(), copyLib, toolResults);
    if (!(result.toolCalls || []).length && !/momentito|segundito/i.test(result.reply)) break;
  }
  return { result, phase: mergedSession.flow?.phase };
}

// With toolResults populated, cart→catálogo must never end stuck on filler
const withResults = simulateCartCatalogLoop(false);
if (/momentito|segundito/i.test(withResults.result.reply)) {
  console.error('FAIL: cart→catalog stuck on filler:', withResults.result.reply);
  process.exit(1);
}
if (!/oficina/i.test(withResults.result.reply)) {
  console.error('FAIL: missing category list:', withResults.result.reply);
  process.exit(1);
}

// applyFlowPatch must advance phase for session persistence
const withPatch = simulateCartCatalogLoop(true);
if (withPatch.phase !== 'browse_categories') {
  console.error('FAIL: expected phase browse_categories after patch, got:', withPatch.phase);
  process.exit(1);
}
if (!/oficina/i.test(withPatch.result.reply)) {
  console.error('FAIL: missing category list after patch:', withPatch.result.reply);
  process.exit(1);
}

console.log('OK cart catalog loop');
