import { FlowNode } from './flow-engine';

export interface MenuNode {
  key: string;
  text?: string;
  action?: string;
  options?: MenuNode[];
}

export interface ZentFlowConfig {
  flow: {
    triggers: string[];
    greeting: string;
    options?: Record<string, FlowNode>;
  };
  respondInGroups: boolean;
  zentApiUrl: string;
  zentApiSecret: string;
}

export function toFlowNodes(nodes: unknown): Record<string, FlowNode> | undefined {
  if (!Array.isArray(nodes) || nodes.length === 0) return undefined;
  const out: Record<string, FlowNode> = {};
  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') throw new Error('zent-flow: each option must be an object');
    const n = raw as Record<string, unknown>;
    const key = String(n.key ?? '').trim();
    const text = String(n.text ?? '');
    const action = n.action ? String(n.action).trim() : undefined;
    if (!key) throw new Error('zent-flow: each option needs a non-empty "key"');
    if (key === '__proto__') throw new Error('zent-flow: option key "__proto__" is not allowed');
    if (!text && !action) throw new Error(`zent-flow: option "${key}" needs "text" or "action"`);
    if (Object.hasOwn(out, key)) throw new Error(`zent-flow: duplicate option key "${key}"`);
    out[key] = { text, action, options: toFlowNodes(n.options) };
  }
  return out;
}

function parseTriggers(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.triggers)) {
    return raw.triggers.map((t) => String(t).trim()).filter(Boolean);
  }
  const single = String(raw.trigger ?? '').trim();
  return single ? [single] : [];
}

export function parseConfig(raw: Record<string, unknown>): ZentFlowConfig {
  const greeting = String(raw.greeting ?? '');
  if (!greeting) throw new Error('zent-flow: greeting is required');
  const options = toFlowNodes(raw.options);
  if (!options) throw new Error('zent-flow: at least one menu option is required');
  const triggers = parseTriggers(raw);
  if (triggers.length === 0) {
    throw new Error('zent-flow: at least one trigger word is required (triggers[] or trigger)');
  }
  const zentApiUrl = String(raw.zentApiUrl ?? '').trim().replace(/\/$/, '');
  const zentApiSecret = String(raw.zentApiSecret ?? '').trim();
  if (!zentApiUrl) throw new Error('zent-flow: zentApiUrl is required');
  if (!zentApiSecret) throw new Error('zent-flow: zentApiSecret is required');
  return {
    flow: { triggers, greeting, options },
    respondInGroups: raw.respondInGroups === true,
    zentApiUrl,
    zentApiSecret,
  };
}
