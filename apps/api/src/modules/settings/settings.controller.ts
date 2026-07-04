import { Controller, Get, Patch, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateBotAiDto } from './dto/update-bot-ai.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('settings')
@Controller('settings/store')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get store settings' })
  getStore() {
    return this.settings.getStore();
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update store settings' })
  updateStore(@Body() dto: UpdateStoreDto) {
    return this.settings.updateStore(dto);
  }
}

@ApiTags('settings')
@Controller('settings/bot-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BotAiSettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get bot AI settings' })
  getBotAi() {
    return this.settings.getBotAiSettings();
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update bot AI settings' })
  updateBotAi(@Body() dto: UpdateBotAiDto) {
    return this.settings.updateBotAiSettings(dto);
  }

  @Get('preview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Preview compiled system prompt' })
  preview() {
    return this.settings.getBotAiPreview();
  }

  @Get('variables')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List playbook template variables' })
  variables() {
    return this.settings.getBotAiVariables();
  }

  @Get('balance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Novita balance and low-balance alert state' })
  balance(@Query('force') force?: string) {
    return this.settings.getBotAiBalance(force === '1' || force === 'true');
  }

  @Post('sync-openwa')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sync zent-flow plugin with active bot mode' })
  syncOpenwa() {
    return this.settings.syncZentFlowPlugin();
  }

  @Post('test-n8n')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Send a test event to n8n workflows' })
  testN8n() {
    return this.settings.testN8n();
  }

  @Post('n8n/sandbox/run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Run a safe n8n sales sandbox event sequence' })
  runN8nSandbox() {
    return this.settings.runN8nSalesSandbox();
  }
}
