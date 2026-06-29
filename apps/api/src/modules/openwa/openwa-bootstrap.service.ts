import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenwaService } from './openwa.service';

@Injectable()
export class OpenwaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OpenwaBootstrapService.name);

  constructor(
    private config: ConfigService,
    private openwa: OpenwaService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('WORKER_MODE') === 'true') return;

    const apiKey = this.config.get('OPENWA_API_KEY', '');
    if (!apiKey || apiKey === 'changeme') {
      this.logger.error(
        'OPENWA_API_KEY is not set in environment — webhook will NOT be registered. ' +
          'Add OPENWA_API_KEY to Dokploy Environment.',
      );
      return;
    }

    const retries = 6;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.openwa.validateApiKey();
        this.logger.log('OPENWA_API_KEY validated');
        await this.openwa.ensureWebhook();
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (attempt === 1 && msg.includes('401')) {
          this.logger.error(
            'OPENWA_API_KEY rejected. Use the same key in Dokploy for the whole stack. ' +
              'If OpenWA was reset, delete volume zent_openwa_prod once and redeploy.',
          );
        }
        if (attempt < retries) {
          this.logger.warn(`Webhook setup attempt ${attempt}/${retries} failed: ${msg}`);
          await new Promise((r) => setTimeout(r, 5000));
        } else {
          this.logger.error(`Webhook setup failed after ${retries} attempts: ${msg}`);
        }
      }
    }
  }
}
