import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { OpenwaService } from './openwa.service';
import type { BotRoutingMode } from '../whatsapp-bot/bot-routing.service';

export interface ZentFlowSyncResult {
  ok: boolean;
  passThrough: boolean;
  pluginInstalled: boolean;
  message?: string;
  error?: string;
}

const DEFAULT_GREETING =
  '¡Hola! 👋 Bienvenido a *ZENT*.\n\nPara empezar, elige cómo ver el catálogo:\n\n1️⃣ Ver catálogo completo (PDF)\n2️⃣ Ver productos por categoría\n3️⃣ Ver mi carrito\n4️⃣ Hablar con un asesor\n\nEscribe el número de tu opción:';

@Injectable()
export class OpenwaPluginService {
  private readonly logger = new Logger(OpenwaPluginService.name);

  constructor(
    private openwa: OpenwaService,
    private config: ConfigService,
  ) {}

  private isNotFoundError(err: unknown): boolean {
    const msg = (err as Error)?.message || String(err);
    return /404|not found/i.test(msg);
  }

  private pluginZipPath(): string | null {
    const candidates = [
      this.config.get<string>('ZENT_FLOW_PLUGIN_ZIP', '').trim(),
      '/app/plugins/zent-flow.zip',
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private buildDefaultConfig(passThrough: boolean): Record<string, unknown> {
    const secret =
      this.config.get<string>('BOT_PLUGIN_SECRET') ||
      this.config.get<string>('OPENWA_WEBHOOK_SECRET', 'webhook-secret-2024');
    return {
      passThrough,
      startOnAnyMessage: !passThrough,
      triggers: ['menu', 'inicio', '0'],
      greeting: DEFAULT_GREETING,
      respondInGroups: false,
      zentApiUrl: 'http://backend-api:3000',
      zentApiSecret: secret,
      options: [
        { key: '1', action: 'sendPdf' },
        { key: '2', action: 'showCategories' },
        { key: '3', action: 'showCart' },
        { key: '4', action: 'handoff' },
      ],
    };
  }

  private unwrapPluginConfig(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    const obj = raw as Record<string, unknown>;
    if (obj.config && typeof obj.config === 'object') {
      return obj.config as Record<string, unknown>;
    }
    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>;
      if (data.config && typeof data.config === 'object') {
        return data.config as Record<string, unknown>;
      }
      return data;
    }
    return obj;
  }

  async isZentFlowInstalled(): Promise<boolean> {
    try {
      await this.openwa.apiRequest<unknown>('/api/plugins/zent-flow/config', 'GET');
      return true;
    } catch (err) {
      if (this.isNotFoundError(err)) return false;
      this.logger.warn(`zent-flow install check failed: ${(err as Error)?.message || err}`);
      return false;
    }
  }

  async getZentFlowConfig(): Promise<Record<string, unknown>> {
    try {
      const raw = await this.openwa.apiRequest<unknown>('/api/plugins/zent-flow/config', 'GET');
      return this.unwrapPluginConfig(raw);
    } catch (err) {
      if (this.isNotFoundError(err)) return {};
      this.logger.warn(`Could not read zent-flow config: ${(err as Error)?.message || err}`);
      return {};
    }
  }

  private async installZentFlowIfPossible(): Promise<boolean> {
    const zipPath = this.pluginZipPath();
    if (!zipPath) {
      this.logger.warn('zent-flow.zip not bundled — cannot auto-install');
      return false;
    }
    try {
      await this.openwa.installPluginZip(zipPath);
      this.logger.log(`zent-flow installed from ${zipPath}`);
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/already|exists|duplicate/i.test(msg)) {
        return true;
      }
      this.logger.warn(`zent-flow install failed: ${msg}`);
      return false;
    }
  }

  private async putZentFlowConfig(config: Record<string, unknown>): Promise<void> {
    await this.openwa.apiRequest('/api/plugins/zent-flow/config', 'PUT', { config });
  }

  private async enableZentFlow(): Promise<void> {
    try {
      await this.openwa.apiRequest('/api/plugins/zent-flow/enable', 'POST');
    } catch (err: any) {
      if (!/already|enabled/i.test(err?.message || '')) throw err;
    }
  }

  async syncZentFlowForMode(mode: BotRoutingMode): Promise<ZentFlowSyncResult> {
    const passThrough = mode === 'ai';
    let installed = await this.isZentFlowInstalled();

    if (!installed) {
      installed = await this.installZentFlowIfPossible();
    }

    if (!installed) {
      if (passThrough) {
        return {
          ok: true,
          passThrough: true,
          pluginInstalled: false,
          message:
            'Plugin zent-flow no instalado en OpenWA. En modo IA los mensajes van directo al webhook — no se requiere el plugin.',
        };
      }
      return {
        ok: false,
        passThrough: false,
        pluginInstalled: false,
        error:
          'Plugin zent-flow no encontrado en OpenWA. Ejecuta infra/scripts/setup-zent-flow-plugin.sh en el servidor o redeploy con zent-flow.zip incluido.',
      };
    }

    try {
      const current = await this.getZentFlowConfig();
      const updated = {
        ...this.buildDefaultConfig(passThrough),
        ...current,
        passThrough,
        startOnAnyMessage: !passThrough,
      };
      await this.putZentFlowConfig(updated);
      await this.enableZentFlow();
      this.logger.log(`zent-flow synced: passThrough=${passThrough}`);
      return {
        ok: true,
        passThrough,
        pluginInstalled: true,
        message: passThrough
          ? 'zent-flow en modo pass-through (IA activa)'
          : 'zent-flow en modo menu numerico',
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      this.logger.warn(`zent-flow sync failed: ${message}`);
      return { ok: false, passThrough, pluginInstalled: true, error: message };
    }
  }
}
