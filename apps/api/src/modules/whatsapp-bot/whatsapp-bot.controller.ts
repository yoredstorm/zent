import { Controller, Post, Body, Headers, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OpenwaService } from '../openwa/openwa.service';
import { WaMessageService } from '../whatsapp-inbox/wa-message.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('webhooks')
@Controller('webhooks')
export class WhatsappBotController {
  private queue: Queue;
  private readonly logger = new Logger(WhatsappBotController.name);

  constructor(
    private config: ConfigService,
    private openwa: OpenwaService,
    private waMessages: WaMessageService,
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
        this.logger.warn('Webhook rejected: invalid signature');
        return { status: 'invalid_signature' };
      }
    }

    const event = body?.event as string | undefined;
    const data = body?.data ?? body;

    if (event && event !== 'message.received') {
      this.logger.log(`Webhook ignored: event=${event}`);
      return { status: 'ignored', reason: 'event' };
    }

    const chatId = data?.chatId || data?.from || body?.chatId || body?.from;
    const messageBody = data?.body || data?.text || body?.body || body?.text || '';
    const from = data?.from || body?.from || body?.author || '';
    const fromMe = data?.fromMe === true;
    const senderPhone =
      data?.senderPhone ||
      data?.contact?.phone ||
      data?.contact?.number ||
      body?.senderPhone ||
      undefined;
    const waSessionId = (body?.sessionId as string | undefined)?.trim() || undefined;

    if (!chatId || !messageBody) {
      this.logger.log(`Webhook ignored: missing chatId or body (chatId=${chatId ?? 'none'})`);
      return { status: 'ignored', reason: 'missing_fields' };
    }

    if (fromMe) {
      this.logger.log('Webhook ignored fromMe (already logged on send)');
      return { status: 'ignored', reason: 'fromMe' };
    }

    try {
      await this.waMessages.logInbound({
        chatId,
        body: messageBody,
        fromMe: false,
        waSessionId,
        senderPhone,
      });
    } catch (err) {
      this.logger.warn(`Failed to persist inbound message: ${err}`);
    }

    const key =
      idempotencyKey ||
      body?.idempotencyKey ||
      data?.id ||
      body?.id ||
      `${waSessionId ?? 'default'}-${chatId}-${Date.now()}`;

    await this.queue.add('message', {
      chatId,
      body: messageBody,
      from,
      senderPhone,
      waSessionId,
      idempotencyKey: key,
    });

    this.logger.log(
      `Enqueued message from ${chatId} session=${waSessionId ?? 'auto'} body="${messageBody.slice(0, 40)}"`,
    );
    return { status: 'queued' };
  }
}
