import { Module, Global } from '@nestjs/common';
import { OpenwaService } from './openwa.service';
import { OpenwaController } from './openwa.controller';

@Global()
@Module({
  controllers: [OpenwaController],
  providers: [OpenwaService],
  exports: [OpenwaService],
})
export class OpenwaModule {}