const engine = require('./zent-orchestrator-engine.source.js');
const copySrc = require('./zent-copy-variants.source.js');
const { applyFlowPatch } = require('./shared/zent-flow-patch.source.js');

const copyLib = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

function simulateCategoryPickLoop(applyPatchBetweenRounds) {
  const toolResults = {
    'categories.list': {
      categories: [{ id: 'c1', name: 'oficina', productCount: 2 }],
    },
  };
  let mergedSession = {
    storeName: 'ohana',
    flow: {
      phase: 'browse_categories',
      categoryList: [{ id: 'c1', name: 'oficina', productCount: 2 }],
    },
  };

  const orchInput = () => ({
    message: '1',
    session: mergedSession,
    contactPhone: '519',
    chatId: 'x',
    stateKey: 's::x',
  });

  let result = engine.runOrchestrator(orchInput(), copyLib, toolResults);
  for (let round = 0; round < 6; round++) {
    const calls = result.toolCalls || [];
    if (!calls.length) break;

    if (applyPatchBetweenRounds) {
      mergedSession = applyFlowPatch(mergedSession, result.patch);
    }

    for (const tc of calls) {
      if (tc.name === 'products.by_category') {
        toolResults[tc.name] = {
          products: [{ id: 'p1', name: 'papel', price: 10, lowStock: false }],
        };
      }
    }

    result = engine.runOrchestrator(orchInput(), copyLib, toolResults);
    if (!(result.toolCalls || []).length) break;
  }

  return { result, phase: mergedSession.flow?.phase };
}

const withoutPatch = simulateCategoryPickLoop(false);
if (!/momentito|segundito/i.test(withoutPatch.result.reply)) {
  // Without patch, phase stays browse_categories — may re-fetch or loop; filler or stuck is acceptable
  if (/papel/i.test(withoutPatch.result.reply) && withoutPatch.phase === 'browse_categories') {
    // Accidentally works but wrong phase — still a failure for persistence
  } else if (!/momentito|segundito/i.test(withoutPatch.result.reply) && !/papel/i.test(withoutPatch.result.reply)) {
    console.error('FAIL: without patch expected filler or wrong-phase behavior, got:', withoutPatch.result.reply);
    process.exit(1);
  }
}
// Key assertion: without patch, phase should NOT advance to browse_products
if (withoutPatch.phase === 'browse_products') {
  console.error('FAIL: without patch phase should not be browse_products');
  process.exit(1);
}

const withPatch = simulateCategoryPickLoop(true);
if (/momentito|segundito/i.test(withPatch.result.reply)) {
  console.error('FAIL: with patch expected product list, got filler:', withPatch.result.reply);
  process.exit(1);
}
if (withPatch.phase !== 'browse_products') {
  console.error('FAIL: expected phase browse_products, got:', withPatch.phase);
  process.exit(1);
}
if (!/papel/i.test(withPatch.result.reply)) {
  console.error('FAIL: missing product in reply:', withPatch.result.reply);
  process.exit(1);
}

console.log('OK tool loop patch apply');
