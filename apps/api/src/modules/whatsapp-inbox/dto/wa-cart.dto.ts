import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class WaCartItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  quantity: number;
}

export class ReleaseWaCartDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;

  @ApiPropertyOptional({ description: 'Mensaje adicional del asesor' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateWaCartDto {
  @ApiProperty({ type: [WaCartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaCartItemDto)
  items: WaCartItemDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
