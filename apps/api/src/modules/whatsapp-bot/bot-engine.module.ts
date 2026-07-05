import { Global, Module, forwardRef } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { NovitaBalanceModule } from '../bot-ai/novita-balance.module';
import { OpenwaModule } from '../openwa/openwa.module';

@Global()
@Module({
  imports: [NovitaBalanceModule, forwardRef(() => OpenwaModule)],
  providers: [BotEngineService],
  exports: [BotEngineService],
})
export class BotEngineModule {}
