import { Module, Global } from '@nestjs/common';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappBotController } from './whatsapp-bot.controller';
import { BotPluginController } from './bot-plugin.controller';
import { WhatsappBotWorker } from './whatsapp-bot.worker';
import { CartService } from './cart.service';
import { ChatSessionService } from './chat-session.service';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';

@Global()
@Module({
  imports: [CustomersModule, OrdersModule, InventoryModule],
  controllers: [WhatsappBotController, BotPluginController],
  providers: [WhatsappBotService, WhatsappBotWorker, CartService, ChatSessionService],
  exports: [WhatsappBotService, CartService, ChatSessionService],
})
export class WhatsappBotModule {}