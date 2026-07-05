import { Global, Module } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { NovitaBalanceModule } from '../bot-ai/novita-balance.module';

@Global()
@Module({
  imports: [NovitaBalanceModule],
  providers: [BotEngineService],
  exports: [BotEngineService],
})
export class BotEngineModule {}
