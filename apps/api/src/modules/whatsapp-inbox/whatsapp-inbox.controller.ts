import { Controller, Get, Post, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WaMessageService } from './wa-message.service';
import { OpenwaService } from '../openwa/openwa.service';
import { BotTurnLogService } from '../whatsapp-bot/bot-turn-log.service';
import { N8nSessionToolsService } from '../workflows/n8n-session-tools.service';
import { parseWaConversationId } from './wa-conversation.util';
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
    private turnLog: BotTurnLogService,
    private sessionTools: N8nSessionToolsService,
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

  @Get('diagnostics')
  @ApiOperation({ summary: 'WhatsApp inbox and webhook diagnostics' })
  diagnostics() {
    return this.waMessages.getDiagnostics();
  }

  @Post('sync/recent')
  @ApiOperation({ summary: 'Best-effort sync recent chats from OpenWA' })
  syncRecent(@Query('limit') limit?: string) {
    return this.waMessages.syncRecentFromOpenWA(limit ? parseInt(limit, 10) : 20);
  }

  @Get('conversations/:chatId/meta')
  @ApiOperation({ summary: 'Conversation metadata (session, customer, order)' })
  getMeta(@Param('chatId') chatId: string) {
    return this.waMessages.getConversationMeta(chatId);
  }

  @Get('conversations/:chatId/activity')
  @ApiOperation({ summary: 'Bot turn activity log (tools, errors)' })
  getActivity(@Param('chatId') chatId: string, @Query('limit') limit?: string) {
    return this.turnLog.listForChat(chatId, limit ? parseInt(limit, 10) : 50);
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

  @Post('conversations/:chatId/bot-handoff')
  @ApiOperation({ summary: 'Pause bot and hand conversation to human agent' })
  async botHandoff(@Param('chatId') chatId: string) {
    const convId = decodeURIComponent(chatId);
    const { waSessionId } = parseWaConversationId(convId);
    const meta = await this.waMessages.getConversationMeta(convId);
    await this.sessionTools.handoff(convId, {
      contactPhone: meta.session?.customerPhone ?? meta.customer?.phone ?? undefined,
      customerName: meta.session?.customerName ?? meta.customer?.name ?? undefined,
      waSessionId: waSessionId ?? undefined,
    });
    return { ok: true, botPaused: true };
  }

  @Post('conversations/:chatId/bot-resume')
  @ApiOperation({ summary: 'Resume bot after human handoff' })
  async botResume(@Param('chatId') chatId: string) {
    const convId = decodeURIComponent(chatId);
    return this.sessionTools.resumeBot(convId);
  }
}
