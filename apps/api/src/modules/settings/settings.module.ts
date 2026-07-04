import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { BotAiSettingsController, SettingsController } from './settings.controller';
import { BotAiModule } from '../bot-ai/bot-ai.module';
import { SetupModule } from '../setup/setup.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { BotEngineModule } from '../whatsapp-bot/bot-engine.module';

@Module({
  imports: [BotAiModule, SetupModule, WorkflowsModule, BotEngineModule],
  controllers: [SettingsController, BotAiSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
