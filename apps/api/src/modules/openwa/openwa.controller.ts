import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { OpenwaService } from './openwa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('openwa')
@Controller('openwa')
@UseGuards(JwtAuthGuard)
export class OpenwaController {
  constructor(
    private openwa: OpenwaService,
    private config: ConfigService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Public OpenWA dashboard URL for advanced settings' })
  getConfig() {
    return {
      publicUrl: this.config.get('OPENWA_PUBLIC_URL', '').trim() || null,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp session status' })
  async getStatus() {
    try {
      const sessions = await this.openwa.getSessions();
      if (sessions.length === 0) {
        return {
          status: 'no_sessions',
          message: 'No hay sesiones activas.',
          sessions: [],
        };
      }
      const rawStatus = await this.openwa.getSessionStatus();
      const status = this.openwa.mapStatusForUi(rawStatus);
      return { status, rawStatus, sessions };
    } catch {
      return { status: 'error', message: 'No se pudo conectar con OpenWA' };
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List all sessions' })
  async getSessions() {
    try {
      return await this.openwa.getSessions();
    } catch {
      return [];
    }
  }

  @Get('qr')
  @ApiOperation({ summary: 'Get QR code for linking' })
  async getQR() {
    try {
      const qr = await this.openwa.getQRCode();
      return { qr };
    } catch {
      return { error: 'No se pudo obtener QR. Asegúrate de tener una sesión activa.' };
    }
  }
}
