import type { IPlugin, PluginContext, HookContext, IncomingMessage } from '../types/openwa';
import { FlowEngine } from './flow-engine.ts';
import { parseConfig, type ZentFlowConfig } from './config-parser.ts';

declare const __PLUGIN_VERSION__: string;
const PLUGIN_VERSION = typeof __PLUGIN_VERSION__ !== 'undefined' ? __PLUGIN_VERSION__ : '0.0.0-dev';

export default class ZentFlow implements IPlugin {
  private config: ZentFlowConfig | null = null;

  async onEnable(ctx: PluginContext): Promise<void> {
    this.config = parseConfig(ctx.config);
    ctx.registerHook('message:received', (hook) => this.onMessage(ctx, hook as HookContext<IncomingMessage>));
    ctx.logger.log(`zent-flow v${PLUGIN_VERSION} enabled`);
  }

  async onConfigChange(ctx: PluginContext, _newConfig: Record<string, unknown>): Promise<void> {
    this.config = parseConfig(ctx.config);
  }

  private async callZentAction(
    cfg: ZentFlowConfig,
    ctx: PluginContext,
    action: string,
    hook: HookContext<IncomingMessage>,
  ): Promise<void> {
    const m = hook.data;
    const url = `${cfg.zentApiUrl}/api/internal/bot/action`;
    const res = await ctx.net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Plugin-Secret': cfg.zentApiSecret,
      },
      body: JSON.stringify({
        action,
        sessionId: hook.sessionId,
        chatId: m.chatId,
        from: m.from,
        senderPhone: m.senderPhone ?? undefined,
        body: m.body,
      }),
      timeoutMs: 30_000,
    });
    if (!res.ok) {
      throw new Error(`Zent API ${res.status}: ${res.body.slice(0, 200)}`);
    }
  }

  private async onMessage(ctx: PluginContext, hook: HookContext<IncomingMessage>): Promise<{ continue: boolean }> {
    const cfg = this.config;
    if (!cfg || hook.source !== 'Engine' || !hook.sessionId) return { continue: true };
    const m = hook.data;
    if (m.fromMe || typeof m.body !== 'string' || !m.chatId || !m.id) return { continue: true };
    if (m.isGroup && !cfg.respondInGroups) return { continue: true };

    try {
      const handled = await FlowEngine.processMessage(
        ctx,
        cfg.flow,
        hook.sessionId,
        m.chatId,
        m.body,
        m.id,
        (action) => this.callZentAction(cfg, ctx, action, hook),
      );
      return { continue: !handled };
    } catch (err) {
      ctx.logger.error('zent-flow: flow processing failed', err);
      return { continue: true };
    }
  }
}
