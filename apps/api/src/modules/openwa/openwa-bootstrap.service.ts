import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from './openwa.service';

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
}
