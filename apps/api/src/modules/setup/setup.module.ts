import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { SecretsService } from './secrets.service';
import { InstallGuard } from './install.guard';

@Module({
  controllers: [SetupController],
  providers: [
    SetupService,
    SecretsService,
    {
      provide: APP_GUARD,
      useClass: InstallGuard,
    },
  ],
  exports: [SetupService],
})
export class SetupModule {}
