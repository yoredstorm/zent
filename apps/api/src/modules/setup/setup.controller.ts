import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  MessageEvent,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { SetupService } from './setup.service';
import { InstallDto, TestNovitaDto } from './dto/setup.dto';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private setup: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado de instalacion y datos basicos de la tienda' })
  getStatus() {
    return this.setup.getStatus();
  }

  @Get('credentials')
  @ApiOperation({ summary: 'Resumen de credenciales (solo antes de instalar)' })
  async getCredentials() {
    await this.ensureNotInstalled();
    return this.setup.getCredentialsSummary();
  }

  @Post('install')
  @ApiOperation({ summary: 'Ejecuta la instalacion (idempotente); progreso por SSE' })
  async install(@Body() dto: InstallDto) {
    await this.ensureNotInstalled();
    return this.setup.startInstall(dto);
  }

  @Sse('install/stream')
  @ApiOperation({ summary: 'Stream SSE del progreso de instalacion' })
  installStream(): Observable<MessageEvent> {
    return this.setup.getInstallStream();
  }

  @Get('whatsapp/status')
  @ApiOperation({ summary: 'Estado de la sesion de WhatsApp (durante el setup)' })
  whatsappStatus() {
    return this.setup.getWhatsappStatus();
  }

  @Get('whatsapp/qr')
  @ApiOperation({ summary: 'QR de vinculacion de WhatsApp (durante el setup)' })
  whatsappQR() {
    return this.setup.getWhatsappQR();
  }

  @Post('whatsapp/connect')
  @ApiOperation({ summary: 'Crea/inicia la sesion de WhatsApp y devuelve el QR' })
  whatsappConnect() {
    return this.setup.connectWhatsapp();
  }

  @Post('novita/test')
  @ApiOperation({ summary: 'Prueba conexion y saldo Novita AI' })
  testNovita(@Body() dto: TestNovitaDto) {
    return this.setup.testNovitaApiKey(dto.novitaApiKey);
  }

  private async ensureNotInstalled() {
    if (await this.setup.isInstalled()) {
      throw new ForbiddenException('El sistema ya esta instalado.');
    }
  }
}
