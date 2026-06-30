import { Controller, Get, Post, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WaMessageService } from './wa-message.service';
import { OpenwaService } from '../openwa/openwa.service';
import { SendWaMessageDto } from './dto/send-message.dto';
import { SendWaMediaDto } from './dto/send-media.dto';

@ApiTags('whatsapp')
@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappInboxController {
  private readonly logger = new Logger(WhatsappInboxController.name);

  constructor(
    private waMessages: WaMessageService,
    private openwa: OpenwaService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List WhatsApp conversations' })
  async listConversations(@Query('filter') filter?: 'handoff' | 'orders' | 'carts') {
    try {
      return await this.waMessages.listConversations(filter);
    } catch (err: any) {
      this.logger.error(`GET conversations failed: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  @Get('conversations/:chatId/meta')
  @ApiOperation({ summary: 'Conversation metadata (session, customer, order)' })
  getMeta(@Param('chatId') chatId: string) {
    return this.waMessages.getConversationMeta(chatId);
  }

  @Post('conversations/:chatId/sync')
  @ApiOperation({ summary: 'Sync message history from OpenWA' })
  async syncConversation(@Param('chatId') chatId: string) {
    const result = await this.waMessages.syncFromOpenWA(chatId, { limit: 100, force: true });
    return { ok: true, ...result };
  }

  @Get('conversations/:chatId/messages')
  @ApiOperation({ summary: 'Message history for a conversation' })
  async listMessages(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('sync') sync?: string,
  ) {
    const shouldSync = sync !== '0' && sync !== 'false';
    return this.waMessages.listMessages(
      chatId,
      limit ? parseInt(limit, 10) : 50,
      before,
      shouldSync,
    );
  }

  @Post('conversations/:chatId/send')
  @ApiOperation({ summary: 'Send message as agent' })
  async sendMessage(@Param('chatId') chatId: string, @Body() dto: SendWaMessageDto) {
    const { waChatId, waSessionId } = this.waMessages.resolveSendTarget(chatId);
    await this.openwa.sendText({
      chatId: waChatId,
      text: dto.text,
      sessionId: waSessionId,
      source: 'agent',
    });
    return { ok: true };
  }

  @Post('conversations/:chatId/send-media')
  @ApiOperation({ summary: 'Send image or document as agent' })
  async sendMedia(@Param('chatId') chatId: string, @Body() dto: SendWaMediaDto) {
    const { waChatId, waSessionId } = this.waMessages.resolveSendTarget(chatId);
    if (dto.type === 'image') {
      await this.openwa.sendImage({
        chatId: waChatId,
        image: { url: dto.url, mimetype: dto.mimeType },
        caption: dto.caption,
        sessionId: waSessionId,
        source: 'agent',
      });
    } else {
      await this.openwa.sendDocument({
        chatId: waChatId,
        document: { url: dto.url, mimetype: dto.mimeType || 'application/pdf' },
        caption: dto.caption,
        sessionId: waSessionId,
        source: 'agent',
      });
    }
    return { ok: true };
  }
}
