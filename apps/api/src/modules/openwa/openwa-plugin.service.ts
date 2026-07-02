import { Injectable, Logger } from '@nestjs/common';
import { OpenwaService } from './openwa.service';
import type { BotRoutingMode } from '../whatsapp-bot/bot-routing.service';

export interface ZentFlowSyncResult {
  ok: boolean;
  passThrough: boolean;
  error?: string;
}

@Injectable()
export class OpenwaPluginService {
  private readonly logger = new Logger(OpenwaPluginService.name);

  constructor(private openwa: OpenwaService) {}

  async getZentFlowConfig(): Promise<Record<string, unknown>> {
    try {
      const raw = await this.openwa.apiRequest<unknown>('/api/plugins/zent-flow/config', 'GET');
      if (raw && typeof raw === 'object' && 'data' in (raw as object)) {
        const data = (raw as { data?: unknown }).data;
        if (data && typeof data === 'object') return data as Record<string, unknown>;
      }
      if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    } catch (err: any) {
      this.logger.warn(`Could not read zent-flow config: ${err?.message || err}`);
    }
    return {};
  }

  async syncZentFlowForMode(mode: BotRoutingMode): Promise<ZentFlowSyncResult> {
    const passThrough = mode === 'ai';
    try {
      const current = await this.getZentFlowConfig();
      const updated = {
        ...current,
        passThrough,
        startOnAnyMessage: !passThrough,
      };
      await this.openwa.apiRequest('/api/plugins/zent-flow/config', 'PUT', updated);
      this.logger.log(`zent-flow synced: passThrough=${passThrough}`);
      return { ok: true, passThrough };
    } catch (err: any) {
      const message = err?.message || String(err);
      this.logger.warn(`zent-flow sync failed: ${message}`);
      if (passThrough) {
        try {
          await this.openwa.apiRequest('/api/plugins/zent-flow/disable', 'POST');
          this.logger.log('zent-flow disabled as fallback for AI mode');
          return { ok: true, passThrough: true };
        } catch (disableErr: any) {
          return {
            ok: false,
            passThrough,
            error: disableErr?.message || message,
          };
        }
      }
      return { ok: false, passThrough, error: message };
    }
  }
}
