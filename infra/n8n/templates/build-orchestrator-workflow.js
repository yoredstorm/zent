const fs = require('fs');
const path = require('path');

const dir = __dirname;

function readSource(relPath) {
  return fs.readFileSync(path.join(dir, relPath), 'utf8');
}

const concatOrder = [
  'zent-copy-variants.source.js',
  'shared/zent-intent.source.js',
  'shared/zent-product-utils.source.js',
  'shared/zent-flow-patch.source.js',
  'shared/zent-catalog-render.source.js',
  'shared/zent-orchestrator-helpers.source.js',
  'flows/zent-flow-order-status.source.js',
  'flows/zent-flow-checkout.source.js',
  'flows/zent-flow-cart.source.js',
  'flows/zent-flow-catalog.source.js',
  'flows/zent-flow-menu.source.js',
  'zent-orchestrator-router.source.js',
];

function stripNodeExports(src) {
  return src.replace(/\r?\nif \(typeof module !== 'undefined'\) \{[\s\S]*?\}\s*$/m, '\n');
}

const flowEngineCode = `${concatOrder.map((f) => stripNodeExports(readSource(f))).join('\n')}

const input = $json.body ?? $json;
const ctx = input.context ?? {};
const apiUrl = ctx.zentApiUrl || 'http://backend-api:3000/api';
const secret = ctx.zentN8nSecret || '';
const session = ctx.session ?? {};
const stateKey = ctx.stateKey || (input.waSessionId ? input.waSessionId + '::' + input.chatId : input.chatId);
const chatId = input.chatId;
const contactPhone = input.contactPhone;
const message = String(input.message ?? input.text ?? input.body?.message ?? '').trim();

async function callTool(name, body) {
  return await this.helpers.httpRequest({
    method: 'POST',
    url: apiUrl + '/webhooks/n8n/tools/' + name,
    headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
    body,
    json: true,
  });
}

const copyLib = { pick, pickAvoidRepeat, timeGreeting, buildCopy };

const toolResults = {};
let mergedSession = { ...session };
const orchInput = () => ({
  message,
  session: mergedSession,
  contactPhone,
  chatId,
  stateKey,
  waSessionId: input.waSessionId,
  categories: toolResults['categories.list']?.categories,
});

let result = runOrchestrator(orchInput(), copyLib, toolResults);
const executedTools = new Set();

for (let round = 0; round < 6; round++) {
  const calls = result.toolCalls || [];
  if (!calls.length) break;

  mergedSession = applyFlowPatch(mergedSession, result.patch);

  for (const tc of calls) {
    const sig = tc.name + ':' + JSON.stringify(tc.body || {});
    if (executedTools.has(sig)) continue;
    executedTools.add(sig);
    try {
      toolResults[tc.name] = await callTool.call(this, tc.name, tc.body);
    } catch (e) {
      toolResults[tc.name] = null;
    }
  }

  result = runOrchestrator(orchInput(), copyLib, toolResults);
  if (!(result.toolCalls || []).length) break;
}
mergedSession = applyFlowPatch(mergedSession, result.patch);

if (result.patch && Object.keys(result.patch).length > 0) {
  try {
    await callTool.call(this, 'chat.session.patch', { chatId: stateKey, flow: result.patch });
  } catch (e) {}
}

return [{ json: { reply: result.reply, handoff: result.handoff, metadata: { phase: result.nextPhase }, media: result.media || [] } }];
`;

const workflow = {
  name: 'Zent WhatsApp Orchestrator',
  nodes: [
    {
      parameters: { path: 'zent-chat', httpMethod: 'POST', responseMode: 'responseNode' },
      id: 'webhook-zent-chat',
      name: 'Zent Chat Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [-600, 0],
      webhookId: 'zent-chat-orchestrator',
    },
    {
      parameters: { jsCode: flowEngineCode },
      id: 'flow-engine',
      name: 'Flow Engine',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-200, 0],
    },
    {
      parameters: {
        respondWith: 'json',
        responseBody:
          '={{ JSON.stringify({ reply: $json.reply, handoff: $json.handoff, metadata: $json.metadata }) }}',
      },
      id: 'respond-webhook',
      name: 'Respond',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [200, 0],
    },
  ],
  connections: {
    'Zent Chat Webhook': { main: [[{ node: 'Flow Engine', type: 'main', index: 0 }]] },
    'Flow Engine': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
  },
  active: false,
  settings: { executionOrder: 'v1' },
  meta: { template: 'zent-whatsapp-orchestrator' },
};

fs.writeFileSync(
  path.join(dir, 'zent-whatsapp-orchestrator.workflow.json'),
  JSON.stringify(workflow, null, 2),
);
console.log('Written zent-whatsapp-orchestrator.workflow.json');
