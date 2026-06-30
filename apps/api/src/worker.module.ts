import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { OpenwaModule } from './modules/openwa/openwa.module';
import { WhatsappBotModule } from './modules/whatsapp-bot/whatsapp-bot.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { WhatsappInboxModule } from './modules/whatsapp-inbox/whatsapp-inbox.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    OpenwaModule,
    RealtimeModule,
    WhatsappInboxModule,
    WhatsappBotModule,
  ],
  controllers: [HealthController],
})
export class WorkerModule {}