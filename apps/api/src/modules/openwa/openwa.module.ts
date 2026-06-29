import { Module, Global } from '@nestjs/common';
import { OpenwaService } from './openwa.service';
import { OpenwaController } from './openwa.controller';
import { OpenwaBootstrapService } from './openwa-bootstrap.service';

@Global()
@Module({
  controllers: [OpenwaController],
  providers: [OpenwaService, OpenwaBootstrapService],
  exports: [OpenwaService],
})
export class OpenwaModule {}