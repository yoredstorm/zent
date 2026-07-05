const fs = require('fs');
const path = require('path');

const dir = __dirname;
const copySrc = fs.readFileSync(path.join(dir, 'zent-copy-variants.source.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(dir, 'zent-orchestrator-engine.source.js'), 'utf8');

const flowEngineCode = `${copySrc}
${engineSrc}

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

function isLookupFiller(text) {
  return /segundito|momentito|Voy a mirarlo/i.test(String(text || ''));
}

let result = runOrchestrator(orchInput(), copyLib, toolResults);
const executedTools = new Set();

for (let round = 0; round < 6; round++) {
  const calls = result.toolCalls || [];
  if (!calls.length) break;

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

  const next = runOrchestrator(orchInput(), copyLib, toolResults);
  result = next;
  if (!(next.toolCalls || []).length && !isLookupFiller(next.reply)) break;
}

if (result.patch && Object.keys(result.patch).length > 0) {
  try {
    await callTool.call(this, 'chat.session.patch', { chatId: stateKey, flow: result.patch });
  } catch (e) {}
}

return [{ json: { reply: result.reply, handoff: result.handoff, metadata: { phase: result.nextPhase } } }];
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
