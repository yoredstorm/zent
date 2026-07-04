import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from './openwa.service';
import { OpenwaPluginService } from './openwa-plugin.service';
import { BotRoutingService } from '../whatsapp-bot/bot-routing.service';
import { BotEngineService } from '../whatsapp-bot/bot-engine.service';

@Injectable()
export class OpenwaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OpenwaBootstrapService.name);
  private configurePromise: Promise<void> | null = null;
  /** Evita bootstrap en paralelo con POST /setup/install (429 en OpenWA). */
  private installRunning = false;

  constructor(
    private config: ConfigService,
    private openwa: OpenwaService,
    private prisma: PrismaService,
    private openwaPlugin: OpenwaPluginService,
    private botRouting: BotRoutingService,
    private botEngine: BotEngineService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('WORKER_MODE') === 'true') return;
    if (this.installRunning) return;

    const install = await this.prisma.systemInstall.findFirst();
    if (!install?.installed) {
      this.logger.log(
        'Sistema no instalado: OpenWA (Redis + webhook) se configurara al completar /setup',
      );
      return;
    }

    const apiKey = this.config.get('OPENWA_API_KEY', '');
    if (!apiKey || apiKey === 'changeme') {
      this.logger.error(
        'OPENWA_API_KEY no configurada. Ejecuta infra/install.sh o completa /setup.',
      );
      return;
    }

    // Evitar solapar con /setup o post-connect (rate limit 429 en OpenWA)
    setTimeout(
      () =>
        this.configureOpenWaWithRetries().catch((err: any) => {
          this.logger.error(
            `OpenWA bootstrap no bloqueante fallo: ${err?.message || err}. Reintenta tras /setup o reinicio.`,
          );
        }),
      8000,
    );
  }

  setInstallRunning(running: boolean) {
    this.installRunning = running;
  }

  /** Solo Redis + BullMQ durante /setup (sin webhooks; evita 429). */
  async configureInfrastructureOnly(retries = 3): Promise<void> {
    if (this.configurePromise) return this.configurePromise;
    this.configurePromise = this.runInfrastructureOnly(retries).finally(() => {
      this.configurePromise = null;
    });
    return this.configurePromise;
  }

  private async runInfrastructureOnly(retries: number): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.openwa.validateApiKey();
        await this.openwa.ensureInfrastructure();
        this.logger.log('OpenWA infrastructure (Redis + BullMQ) configured during setup');
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (attempt < retries) {
          const delay = msg.includes('429') ? 20000 : 6000;
          this.logger.warn(`OpenWA infra setup ${attempt}/${retries} failed: ${msg}`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.error(`OpenWA infra setup failed after ${retries} attempts: ${msg}`);
          return;
        }
      }
    }
  }

  /** Configura Redis/BullMQ y registra webhooks con reintentos (una sola ejecucion a la vez). */
  configureOpenWaWithRetries(retries = 6): Promise<void> {
    if (this.configurePromise) return this.configurePromise;
    this.configurePromise = this.runConfigureOpenWa(retries).finally(() => {
      this.configurePromise = null;
    });
    return this.configurePromise;
  }

  private async runConfigureOpenWa(retries: number): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.openwa.validateApiKey();
        this.logger.log('OPENWA_API_KEY validada');

        await this.openwa.ensureInfrastructure();
        await this.registerWebhookWithRetries(3);
        await this.resumeDisconnectedSessions();
        await this.syncZentFlowPlugin();
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (attempt === 1 && msg.includes('401')) {
          this.logger.error(
            'OPENWA_API_KEY rechazada. Ejecuta infra/install.sh para sincronizar claves y reiniciar OpenWA.',
          );
        }
        if (attempt < retries) {
          const delay = msg.includes('429') ? 20000 : 6000;
          this.logger.warn(`OpenWA setup attempt ${attempt}/${retries} failed: ${msg}`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.error(`OpenWA setup failed after ${retries} attempts: ${msg}`);
          return;
        }
      }
    }
  }

  /** Registra el webhook con reintentos (util tambien tras completar /setup). */
  async registerWebhookWithRetries(retries = 6): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.openwa.validateApiKey();
        const sessions = await this.openwa.getSessions();
        if (sessions.length === 0) {
          this.logger.log('OpenWA listo; vincula WhatsApp desde /setup o Configuracion');
          return;
        }
        await this.openwa.ensureWebhook();
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (attempt < retries) {
          const delay = msg.includes('429') ? 20000 : 6000;
          this.logger.warn(`Webhook setup attempt ${attempt}/${retries} failed: ${msg}`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.error(`Webhook setup failed after ${retries} attempts: ${msg}`);
          return;
        }
      }
    }
  }

  async repairWebhook(): Promise<{
    ok: boolean;
    apiKeyValid: boolean;
    infrastructureOk: boolean;
    webhookOk: boolean;
    zentFlowOk: boolean;
    mode: 'ai' | 'legacy' | null;
    error?: string;
  }> {
    const result = {
      ok: false,
      apiKeyValid: false,
      infrastructureOk: false,
      webhookOk: false,
      zentFlowOk: false,
      mode: null as 'ai' | 'legacy' | null,
      error: undefined as string | undefined,
    };

    try {
      await this.openwa.validateApiKey();
      result.apiKeyValid = true;

      await this.openwa.ensureInfrastructure();
      result.infrastructureOk = true;

      await this.openwa.ensureWebhook();
      result.webhookOk = true;

      result.mode = await this.botRouting.getMode();
      const cfg = await this.botEngine.getConfig();
      const zentFlow = await this.openwaPlugin.syncZentFlowForEngine(cfg.engine);
      result.zentFlowOk = zentFlow.ok;
      result.ok = result.apiKeyValid && result.infrastructureOk && result.webhookOk && result.zentFlowOk;
      if (!zentFlow.ok) result.error = zentFlow.error ?? 'zent-flow sync failed';
    } catch (err: any) {
      result.error = err?.message || String(err);
      this.logger.warn(`OpenWA webhook repair failed: ${result.error}`);
    }

    return result;
  }

  private async syncZentFlowPlugin(): Promise<void> {
    try {
      const cfg = await this.botEngine.getConfig();
      const result = await this.openwaPlugin.syncZentFlowForEngine(cfg.engine);
      if (result.ok) {
        this.logger.log(
          `zent-flow synced on bootstrap (engine=${cfg.engine}, passThrough=${result.passThrough})`,
        );
      } else {
        this.logger.warn(`zent-flow sync on bootstrap failed: ${result.error}`);
      }
    } catch (err: any) {
      this.logger.warn(`zent-flow sync on bootstrap failed: ${err?.message || err}`);
    }
  }

  async resumeDisconnectedSessions(): Promise<{ resumed: string[]; skipped: string[] }> {
    const resumed: string[] = [];
    const skipped: string[] = [];
    try {
      const sessions = await this.openwa.getSessions();
      for (const session of sessions) {
        if (/connected|ready|authenticated/i.test(session.status)) {
          skipped.push(session.id);
          continue;
        }
        try {
          await this.openwa.startSession(session.id);
          resumed.push(session.id);
          this.logger.log(`Resumed OpenWA session ${session.id}`);
        } catch (err: any) {
          this.logger.warn(`Could not resume session ${session.id}: ${err?.message || err}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`resumeDisconnectedSessions failed: ${err?.message || err}`);
    }
    return { resumed, skipped };
  }
}
