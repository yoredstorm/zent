import { Module, Global, forwardRef } from '@nestjs/common';
import { WhatsappBotService } from './whatsapp-bot.service';
import { WhatsappBotController } from './whatsapp-bot.controller';
import { BotPluginController } from './bot-plugin.controller';
import { WhatsappBotWorker } from './whatsapp-bot.worker';
import { CartService } from './cart.service';
import { ChatSessionService } from './chat-session.service';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WhatsappInboxModule } from '../whatsapp-inbox/whatsapp-inbox.module';
import { BotAiModule } from '../bot-ai/bot-ai.module';
import { BotRoutingService } from './bot-routing.service';
import { BotIntentService } from './bot-intent.service';
import { BotTurnLogService } from './bot-turn-log.service';
import { WorkflowsModule } from '../workflows/workflows.module';
import { BotEngineModule } from './bot-engine.module';

@Global()
@Module({
  imports: [
    CustomersModule,
    OrdersModule,
    InventoryModule,
    WhatsappInboxModule,
    BotEngineModule,
    forwardRef(() => BotAiModule),
    forwardRef(() => WorkflowsModule),
  ],
  controllers: [WhatsappBotController, BotPluginController],
  providers: [
    WhatsappBotService,
    WhatsappBotWorker,
    CartService,
    ChatSessionService,
    BotRoutingService,
    BotIntentService,
    BotTurnLogService,
  ],
  exports: [
    WhatsappBotService,
    CartService,
    ChatSessionService,
    BotRoutingService,
    BotEngineModule,
    BotTurnLogService,
  ],
})
export class WhatsappBotModule {}