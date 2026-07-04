import { Module, forwardRef } from '@nestjs/common';
import { WorkflowEventsService } from './workflow-events.service';
import { WorkflowCallbackController } from './workflow-callback.controller';
import { N8nCommerceToolsController } from './n8n-commerce-tools.controller';
import { N8nToolAuthGuard } from './n8n-tool-auth.guard';
import { N8nChatBridgeService } from './n8n-chat-bridge.service';
import { OrdersModule } from '../orders/orders.module';
import { BotEngineModule } from '../whatsapp-bot/bot-engine.module';

@Module({
  imports: [forwardRef(() => OrdersModule), forwardRef(() => BotEngineModule)],
  controllers: [WorkflowCallbackController, N8nCommerceToolsController],
  providers: [WorkflowEventsService, N8nToolAuthGuard, N8nChatBridgeService],
  exports: [WorkflowEventsService, N8nChatBridgeService],
})
export class WorkflowsModule {}
