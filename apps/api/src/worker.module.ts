import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { OpenwaModule } from './modules/openwa/openwa.module';
import { WhatsappBotModule } from './modules/whatsapp-bot/whatsapp-bot.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    OpenwaModule,
    WhatsappBotModule,
  ],
  controllers: [HealthController],
})
export class WorkerModule {}