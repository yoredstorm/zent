import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CatalogPdfService } from './catalog-pdf.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('catalog-pdf')
@Controller('catalog-pdf')
@UseGuards(JwtAuthGuard)
export class CatalogPdfController {
  constructor(private service: CatalogPdfService) {}

  @Get()
  @ApiOperation({ summary: 'Get active catalog PDF' })
  getActive() {
    return this.service.getActive();
  }

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Upload new catalog PDF' })
  upload(@Body('url') url: string) {
    return this.service.upload(url);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate catalog PDF' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}