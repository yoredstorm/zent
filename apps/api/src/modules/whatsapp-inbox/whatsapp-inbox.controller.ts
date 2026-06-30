import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WaMessageService } from './wa-message.service';
import { OpenwaService } from '../openwa/openwa.service';
import { SendWaMessageDto } from './dto/send-message.dto';

@ApiTags('whatsapp')
@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappInboxController {
  constructor(
    private waMessages: WaMessageService,
    private openwa: OpenwaService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List WhatsApp conversations' })
  listConversations(@Query('filter') filter?: 'handoff' | 'orders') {
    return this.waMessages.listConversations(filter);
  }

  @Get('conversations/:chatId/meta')
  @ApiOperation({ summary: 'Conversation metadata (session, customer, order)' })
  getMeta(@Param('chatId') chatId: string) {
    return this.waMessages.getConversationMeta(chatId);
  }

  @Get('conversations/:chatId/messages')
  @ApiOperation({ summary: 'Message history for a conversation' })
  listMessages(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.waMessages.listMessages(
      chatId,
      limit ? parseInt(limit, 10) : 50,
      before,
    );
  }

  @Post('conversations/:chatId/send')
  @ApiOperation({ summary: 'Send message as agent' })
  async sendMessage(@Param('chatId') chatId: string, @Body() dto: SendWaMessageDto) {
    const decoded = decodeURIComponent(chatId);
    await this.openwa.sendText({
      chatId: decoded,
      text: dto.text,
      source: 'agent',
    });
    return { ok: true };
  }
}
