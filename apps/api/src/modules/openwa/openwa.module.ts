import { Module, Global, forwardRef } from '@nestjs/common';
import { OpenwaService } from './openwa.service';
import { OpenwaController } from './openwa.controller';
import { OpenwaBootstrapService } from './openwa-bootstrap.service';
import { OpenwaPluginService } from './openwa-plugin.service';
import { WhatsappInboxModule } from '../whatsapp-inbox/whatsapp-inbox.module';

@Global()
@Module({
  imports: [forwardRef(() => WhatsappInboxModule)],
  controllers: [OpenwaController],
  providers: [OpenwaService, OpenwaBootstrapService, OpenwaPluginService],
  exports: [OpenwaService, OpenwaBootstrapService, OpenwaPluginService],
})
export class OpenwaModule {}