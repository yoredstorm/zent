import { Module, forwardRef } from '@nestjs/common';
import { WhatsappInboxController } from './whatsapp-inbox.controller';
import { WaMessageService } from './wa-message.service';
import { OpenwaModule } from '../openwa/openwa.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [forwardRef(() => OpenwaModule), InventoryModule, WorkflowsModule],
  controllers: [WhatsappInboxController],
  providers: [WaMessageService],
  exports: [WaMessageService],
})
export class WhatsappInboxModule {}
