import { Module, forwardRef } from '@nestjs/common';
import { WhatsappInboxController } from './whatsapp-inbox.controller';
import { WaMessageService } from './wa-message.service';
import { OpenwaModule } from '../openwa/openwa.module';

@Module({
  imports: [forwardRef(() => OpenwaModule)],
  controllers: [WhatsappInboxController],
  providers: [WaMessageService],
  exports: [WaMessageService],
})
export class WhatsappInboxModule {}
