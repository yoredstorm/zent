import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from './openwa.service';

@Injectable()
export class OpenwaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OpenwaBootstrapService.name);

  constructor(
    private config: ConfigService,
    private openwa: OpenwaService,
    private prisma: PrismaService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('WORKER_MODE') === 'true') return;

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

    await this.configureOpenWaWithRetries();
  }

  /** Configura Redis/BullMQ y registra webhooks con reintentos. */
  async configureOpenWaWithRetries(retries = 6): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.openwa.validateApiKey();
        this.logger.log('OPENWA_API_KEY validada');

        await this.openwa.ensureInfrastructure();
        await this.registerWebhookWithRetries(1);
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (attempt === 1 && msg.includes('401')) {
          this.logger.error(
            'OPENWA_API_KEY rechazada. Ejecuta infra/install.sh para sincronizar claves y reiniciar OpenWA.',
          );
        }
        if (attempt < retries) {
          this.logger.warn(`OpenWA setup attempt ${attempt}/${retries} failed: ${msg}`);
          await new Promise((r) => setTimeout(r, 5000));
        } else {
          this.logger.error(`OpenWA setup failed after ${retries} attempts: ${msg}`);
          throw err;
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
          this.logger.warn(`Webhook setup attempt ${attempt}/${retries} failed: ${msg}`);
          await new Promise((r) => setTimeout(r, 5000));
        } else {
          this.logger.error(`Webhook setup failed after ${retries} attempts: ${msg}`);
          throw err;
        }
      }
    }
  }
}
