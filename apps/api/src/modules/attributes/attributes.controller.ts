import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AttributesService } from './attributes.service';
import {
  CreateAttributeDto,
  UpdateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/attribute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('attributes')
@Controller('attributes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttributesController {
  constructor(private attributes: AttributesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar atributos activos con sus valores' })
  findAll() {
    return this.attributes.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Crear atributo' })
  create(@Body() dto: CreateAttributeDto) {
    return this.attributes.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Actualizar atributo' })
  update(@Param('id') id: string, @Body() dto: UpdateAttributeDto) {
    return this.attributes.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desactivar atributo' })
  remove(@Param('id') id: string) {
    return this.attributes.remove(id);
  }

  @Post(':id/values')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Agregar valor a un atributo' })
  createValue(@Param('id') id: string, @Body() dto: CreateAttributeValueDto) {
    return this.attributes.createValue(id, dto);
  }

  @Put('values/:valueId')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Actualizar valor de atributo' })
  updateValue(@Param('valueId') valueId: string, @Body() dto: UpdateAttributeValueDto) {
    return this.attributes.updateValue(valueId, dto);
  }

  @Delete('values/:valueId')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Eliminar valor de atributo (bloqueado si lo usa un subproducto)' })
  removeValue(@Param('valueId') valueId: string) {
    return this.attributes.removeValue(valueId);
  }
}
