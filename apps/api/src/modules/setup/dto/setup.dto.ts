import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InstallDto {
  @IsString()
  @MinLength(1, { message: 'El nombre de la tienda es obligatorio' })
  storeName!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsString()
  currency: string = 'PEN';

  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  taxRate: number = 18;

  @IsString()
  @MinLength(6, { message: 'El telefono responsable es obligatorio' })
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsEmail({}, { message: 'Email de administrador invalido' })
  adminEmail!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  adminPassword!: string;

  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsBoolean()
  novitaBotEnabled?: boolean;

  @IsOptional()
  @IsString()
  novitaApiKey?: string;
}

export class WhatsappLinkedDto {
  @IsBoolean()
  linked!: boolean;
}

export class TestNovitaDto {
  @IsOptional()
  @IsString()
  novitaApiKey?: string;
}
