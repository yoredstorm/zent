import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { WhatsappBotService, BotPluginAction } from './whatsapp-bot.service';

interface BotActionBody {
  action: string;
  sessionId?: string;
  chatId: string;
  from: string;
  senderPhone?: string;
  body?: string;
}

const VALID_ACTIONS = new Set<BotPluginAction>([
  'sendPdf',
  'showCategories',
  'showCart',
  'handoff',
]);

@ApiTags('internal')
@Controller('internal/bot')
export class BotPluginController {
  private readonly logger = new Logger(BotPluginController.name);

  constructor(
    private bot: WhatsappBotService,
    private config: ConfigService,
  ) {}

  @Post('action')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Execute a WhatsApp bot action (OpenWA zent-flow plugin)' })
  async runAction(
    @Headers('x-bot-plugin-secret') secret: string | undefined,
    @Body() body: BotActionBody,
  ) {
    const expected =
      this.config.get<string>('BOT_PLUGIN_SECRET') ||
      this.config.get<string>('OPENWA_WEBHOOK_SECRET', '');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid bot plugin secret');
    }

    if (!body?.chatId || !body?.from || !body?.action) {
      return { ok: false, error: 'missing_fields' };
    }
    if (!VALID_ACTIONS.has(body.action as BotPluginAction)) {
      return { ok: false, error: 'unknown_action' };
    }

    await this.bot.runAction(body.action as BotPluginAction, {
      chatId: body.chatId,
      from: body.from,
      sessionId: body.sessionId,
      senderPhone: body.senderPhone,
    });

    this.logger.log(`Plugin action ${body.action} for ${body.chatId}`);
    return { ok: true };
  }
}
