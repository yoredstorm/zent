import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OpenwaService } from './openwa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('openwa')
@Controller('openwa')
@UseGuards(JwtAuthGuard)
export class OpenwaController {
  constructor(private openwa: OpenwaService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp session status' })
  async getStatus() {
    try {
      const sessions = await this.openwa.getSessions();
      if (sessions.length === 0) {
        return { status: 'no_sessions', message: 'No hay sesiones. Crea una en el dashboard de OpenWA: http://localhost:2785', sessions: [] };
      }
      const status = await this.openwa.getSessionStatus();
      return { status, sessions };
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