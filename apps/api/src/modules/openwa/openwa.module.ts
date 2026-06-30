import { Module, Global, forwardRef } from '@nestjs/common';
import { OpenwaService } from './openwa.service';
import { OpenwaController } from './openwa.controller';
import { OpenwaBootstrapService } from './openwa-bootstrap.service';
import { WhatsappInboxModule } from '../whatsapp-inbox/whatsapp-inbox.module';

@Global()
@Module({
  imports: [forwardRef(() => WhatsappInboxModule)],
  controllers: [OpenwaController],
  providers: [OpenwaService, OpenwaBootstrapService],
  exports: [OpenwaService],
})
export class OpenwaModule {}