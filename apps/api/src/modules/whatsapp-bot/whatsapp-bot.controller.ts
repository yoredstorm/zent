import { Controller, Post, Body, Headers, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OpenwaService } from '../openwa/openwa.service';
import { WaMessageService } from '../whatsapp-inbox/wa-message.service';
import { Public } from '../auth/decorators/public.decorator';
import { mapOpenWaMessageType, mediaPlaceholder } from '../whatsapp-inbox/wa-message-mapper.util';

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
    const messageBody = (data?.body || data?.text || body?.body || body?.text || '').trim();
    const from = data?.from || body?.from || body?.author || '';
    const fromMe = data?.fromMe === true;
    const senderPhone =
      data?.senderPhone ||
      data?.contact?.phone ||
      data?.contact?.number ||
      body?.senderPhone ||
      undefined;
    const waSessionId = (body?.sessionId as string | undefined)?.trim() || undefined;
    const contactName =
      data?.notifyName ||
      data?.pushName ||
      data?.sender?.pushName ||
      data?.contact?.name ||
      data?.contact?.pushName ||
      body?.notifyName ||
      body?.pushName ||
      undefined;
    const waMessageId = (data?.id || body?.id) as string | undefined;
    const hasMedia = data?.hasMedia === true || body?.hasMedia === true;
    const messageType = mapOpenWaMessageType(data?.type || body?.type, hasMedia);
    const caption = (data?.caption || body?.caption || '').trim() || undefined;
    const mediaUrl = data?.mediaUrl || data?.media?.url || body?.mediaUrl || body?.media?.url;
    const mimeType =
      data?.mimetype || data?.mimeType || data?.media?.mimetype || body?.mimetype || undefined;

    if (!chatId) {
      this.logger.log('Webhook ignored: missing chatId');
      return { status: 'ignored', reason: 'missing_chatId' };
    }

    const hasContent = !!(messageBody || caption || mediaUrl || hasMedia || messageType !== 'text');
    if (!hasContent) {
      this.logger.log(`Webhook ignored: empty message (chatId=${chatId})`);
      return { status: 'ignored', reason: 'missing_fields' };
    }

    const displayBody = messageBody || caption || mediaPlaceholder(messageType);

    if (fromMe) {
      if (waMessageId && (await this.waMessages.existsByWaMessageId(waMessageId))) {
        return { status: 'ignored', reason: 'fromMe_duplicate' };
      }
      try {
        await this.waMessages.logOutbound({
          chatId,
          body: displayBody,
          source: 'bot',
          waSessionId,
          messageType,
          mediaUrl: mediaUrl || null,
          mimeType: mimeType || null,
          caption,
          waMessageId,
        });
      } catch (err) {
        this.logger.warn(`Failed to persist fromMe message: ${err}`);
      }
      return { status: 'stored', reason: 'fromMe' };
    }

    try {
      await this.waMessages.logInbound({
        chatId,
        body: displayBody,
        fromMe: false,
        waSessionId,
        senderPhone,
        contactName,
        messageType,
        mediaUrl: mediaUrl || null,
        mimeType: mimeType || null,
        caption,
        waMessageId,
      });
    } catch (err) {
      this.logger.warn(`Failed to persist inbound message: ${err}`);
    }

    if (!messageBody) {
      return { status: 'stored', reason: 'media_only' };
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
