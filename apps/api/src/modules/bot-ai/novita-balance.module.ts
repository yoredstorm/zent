import { Module } from '@nestjs/common';
import { NovitaBalanceService } from './novita-balance.service';

/** Modulo liviano para evitar ciclo BotEngineModule <-> BotAiModule <-> WorkflowsModule. */
@Module({
  providers: [NovitaBalanceService],
  exports: [NovitaBalanceService],
})
export class NovitaBalanceModule {}
