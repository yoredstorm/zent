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
      this.logger.warn('OPENWA_API_KEY not set — skipping webhook registration');
      return;
    }

    const retries = 6;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.openwa.ensureWebhook();
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
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
