import { Module, Global } from '@nestjs/common';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappBotController } from './whatsapp-bot.controller';
import { WhatsappBotWorker } from './whatsapp-bot.worker';
import { CartService } from './cart.service';
import { ChatSessionService } from './chat-session.service';

@Global()
@Module({
  controllers: [WhatsappBotController],
  providers: [WhatsappBotService, WhatsappBotWorker, CartService, ChatSessionService],
  exports: [WhatsappBotService, CartService, ChatSessionService],
})
export class WhatsappBotModule {}