// Vendored OpenWA plugin contract (minimal subset for zent-flow).
export type HookEvent = 'message:received';

export interface HookContext<T = unknown> {
  event: HookEvent;
  data: T;
  sessionId?: string;
  timestamp: Date;
  source: string;
}

export interface HookResult {
  continue: boolean;
}

export type HookHandler = (ctx: HookContext) => Promise<HookResult>;

export interface PluginLogger {
  log(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

export interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PluginMessagingCapability {
  reply(sessionId: string, chatId: string, quotedMessageId: string, text: string): Promise<unknown>;
}

export interface PluginNetRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface PluginNetResponse {
  ok: boolean;
  status: number;
  body: string;
}

export interface PluginNetCapability {
  fetch(url: string, init?: PluginNetRequestInit): Promise<PluginNetResponse>;
}

export interface PluginContext {
  pluginId: string;
  config: Record<string, unknown>;
  logger: PluginLogger;
  storage: PluginStorage;
  registerHook(event: HookEvent, handler: HookHandler, priority?: number): void;
  messages: PluginMessagingCapability;
  net: PluginNetCapability;
}

export interface IPlugin {
  onEnable?(context: PluginContext): Promise<void>;
  onDisable?(context: PluginContext): Promise<void>;
  onConfigChange?(context: PluginContext, newConfig: Record<string, unknown>): Promise<void>;
}

export interface IncomingMessage {
  id: string;
  from: string;
  chatId: string;
  body: string;
  fromMe: boolean;
  isGroup: boolean;
  senderPhone?: string | null;
}
