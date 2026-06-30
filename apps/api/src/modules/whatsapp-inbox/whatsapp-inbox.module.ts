import { Module, forwardRef } from '@nestjs/common';
import { WhatsappInboxController } from './whatsapp-inbox.controller';
import { WaMessageService } from './wa-message.service';
import { OpenwaModule } from '../openwa/openwa.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [forwardRef(() => OpenwaModule), InventoryModule],
  controllers: [WhatsappInboxController],
  providers: [WaMessageService],
  exports: [WaMessageService],
})
export class WhatsappInboxModule {}
