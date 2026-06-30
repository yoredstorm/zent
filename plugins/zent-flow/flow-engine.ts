import type { PluginContext } from '../types/openwa';

export interface FlowNode {
  text: string;
  action?: string;
  options?: Record<string, FlowNode>;
}

export interface SessionFlow {
  triggers: string[];
  greeting: string;
  options?: Record<string, FlowNode>;
}

export interface UserState {
  path: string[];
  lastActive: number;
}

export type ActionHandler = (action: string) => Promise<void>;

export class FlowEngine {
  private static readonly TIMEOUT_MS = 15 * 60 * 1000;
  private static readonly MAX_REPROCESS = 1;
  private static readonly locks = new Map<string, Promise<void>>();

  public static async processMessage(
    context: PluginContext,
    flow: SessionFlow,
    sessionId: string,
    chatId: string,
    messageBody: string,
    messageId: string,
    onAction: ActionHandler,
  ): Promise<boolean> {
    const lockKey = `${sessionId}__${chatId}`;
    const prev = this.locks.get(lockKey) ?? Promise.resolve();
    const run = prev.then(() =>
      this.processLocked(context, flow, sessionId, chatId, messageBody, messageId, onAction, 0),
    );
    const tail = run.catch(() => {});
    this.locks.set(lockKey, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(lockKey) === tail) this.locks.delete(lockKey);
    }
  }

  private static matchesTrigger(triggers: string[], input: string): boolean {
    const lower = input.toLowerCase();
    return triggers.some((t) => t.trim().toLowerCase() === lower);
  }

  private static async processLocked(
    context: PluginContext,
    flow: SessionFlow,
    sessionId: string,
    chatId: string,
    messageBody: string,
    messageId: string,
    onAction: ActionHandler,
    depth = 0,
  ): Promise<boolean> {
    const input = messageBody.trim();
    const stateKey = `state__${sessionId}__${chatId}`.replace(/:/g, '_');
    let state = await context.storage.get<UserState>(stateKey);

    if (state && Date.now() - state.lastActive > this.TIMEOUT_MS) {
      await context.storage.delete(stateKey);
      state = null;
    }

    const isTrigger = this.matchesTrigger(flow.triggers, input);

    if (!state) {
      if (!isTrigger) return false;
      await context.messages.reply(sessionId, chatId, messageId, flow.greeting);
      await context.storage.set(stateKey, { path: [], lastActive: Date.now() });
      return true;
    }

    if (isTrigger) {
      await context.messages.reply(sessionId, chatId, messageId, flow.greeting);
      await context.storage.set(stateKey, { path: [], lastActive: Date.now() });
      return true;
    }

    let currentNode: FlowNode | undefined = { text: flow.greeting, options: flow.options };

    for (const key of state.path) {
      if (currentNode?.options && Object.hasOwn(currentNode.options, key)) {
        currentNode = currentNode.options[key];
      } else {
        await context.storage.delete(stateKey);
        if (depth >= this.MAX_REPROCESS) return false;
        return this.processLocked(
          context,
          flow,
          sessionId,
          chatId,
          messageBody,
          messageId,
          onAction,
          depth + 1,
        );
      }
    }

    const nextNode =
      currentNode.options && Object.hasOwn(currentNode.options, input)
        ? currentNode.options[input]
        : undefined;

    if (nextNode) {
      state.path.push(input);
      state.lastActive = Date.now();

      if (nextNode.action) {
        await onAction(nextNode.action);
        await context.storage.delete(stateKey);
        return true;
      }

      await context.messages.reply(sessionId, chatId, messageId, nextNode.text);

      if (nextNode.options && Object.keys(nextNode.options).length > 0) {
        await context.storage.set(stateKey, state);
      } else {
        await context.storage.delete(stateKey);
      }
      return true;
    }

    if (!currentNode.options || Object.keys(currentNode.options).length === 0) {
      await context.storage.delete(stateKey);
      return false;
    }

    const invalidMsg = `Opción inválida. Elige una de las opciones disponibles:\n\n${currentNode.text || flow.greeting}`;
    await context.messages.reply(sessionId, chatId, messageId, invalidMsg);
    state.lastActive = Date.now();
    await context.storage.set(stateKey, state);
    return true;
  }
}
