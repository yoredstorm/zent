import { Module, forwardRef } from '@nestjs/common';
import { WorkflowEventsService } from './workflow-events.service';
import { WorkflowCallbackController } from './workflow-callback.controller';
import { N8nCommerceToolsController } from './n8n-commerce-tools.controller';
import { N8nToolAuthGuard } from './n8n-tool-auth.guard';
import { N8nChatBridgeService } from './n8n-chat-bridge.service';
import { N8nSessionToolsService } from './n8n-session-tools.service';
import { OrdersModule } from '../orders/orders.module';
import { BotEngineModule } from '../whatsapp-bot/bot-engine.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    forwardRef(() => OrdersModule),
    forwardRef(() => BotEngineModule),
    CustomersModule,
    InventoryModule,
  ],
  controllers: [WorkflowCallbackController, N8nCommerceToolsController],
  providers: [WorkflowEventsService, N8nToolAuthGuard, N8nChatBridgeService, N8nSessionToolsService],
  exports: [WorkflowEventsService, N8nChatBridgeService, N8nSessionToolsService],
})
export class WorkflowsModule {}
