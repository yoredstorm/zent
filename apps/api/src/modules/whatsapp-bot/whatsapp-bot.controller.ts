import { Controller, Post, Body, Headers, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OpenwaService } from '../openwa/openwa.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('webhooks')
@Controller('webhooks')
export class WhatsappBotController {
  private queue: Queue;
  private readonly logger = new Logger(WhatsappBotController.name);

  constructor(
    private config: ConfigService,
    private openwa: OpenwaService,
  ) {
    this.queue = new Queue('whatsapp-messages', {
      connection: {
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: parseInt(this.config.get('REDIS_PORT', '6379')),
      },
    });
  }

  @Post('openwa')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive OpenWA webhooks' })
  async handleWebhook(
    @Body() body: any,
    @Headers('x-openwa-signature') signature?: string,
    @Headers('x-openwa-idempotency-key') idempotencyKey?: string,
  ) {
    if (signature) {
      const payload = JSON.stringify(body);
      if (!this.openwa.verifyWebhookSignature(signature, payload)) {
        this.logger.warn('Invalid webhook signature');
        return { status: 'invalid_signature' };
      }
    }

    const chatId = body?.chatId || body?.from;
    const messageBody = body?.body || body?.text || '';
    const from = body?.from || body?.author || '';
    const key = idempotencyKey || body?.id || `${chatId}-${Date.now()}`;

    if (!chatId || !messageBody) {
      return { status: 'ignored' };
    }

    await this.queue.add('message', {
      chatId,
      body: messageBody,
      from,
      idempotencyKey: key,
    });

    this.logger.debug(`Enqueued message from ${chatId}`);
    return { status: 'queued' };
  }
}