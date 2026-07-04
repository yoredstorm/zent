import { Module, forwardRef } from '@nestjs/common';
import { BotAiOrchestratorService } from './bot-ai-orchestrator.service';
import { BotAiPromptService } from './bot-ai-prompt.service';
import { BotCatalogContextService } from './bot-catalog-context.service';
import { BotCommerceFacade } from './bot-commerce.facade';
import { NovitaBalanceService } from './novita-balance.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [InventoryModule, CustomersModule, OrdersModule, forwardRef(() => WorkflowsModule)],
  providers: [
    NovitaBalanceService,
    BotCatalogContextService,
    BotAiPromptService,
    BotCommerceFacade,
    BotAiOrchestratorService,
  ],
  exports: [
    NovitaBalanceService,
    BotCatalogContextService,
    BotAiPromptService,
    BotCommerceFacade,
    BotAiOrchestratorService,
  ],
})
export class BotAiModule {}
