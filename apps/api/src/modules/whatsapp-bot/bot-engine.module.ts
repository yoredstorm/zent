import { Module, forwardRef } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { BotAiModule } from '../bot-ai/bot-ai.module';

@Module({
  imports: [forwardRef(() => BotAiModule)],
  providers: [BotEngineService],
  exports: [BotEngineService],
})
export class BotEngineModule {}
