import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  deliveryCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ description: 'Cantidad confirmada; 0 = no incluido en la entrega' })
  @IsNumber()
  @Min(0)
  quantity!: number;
}

export class UpdateOrderItemsDto {
  @ApiProperty({ type: [UpdateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items!: UpdateOrderItemDto[];
}

export class CreateOrderItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  customerName!: string;

  @ApiProperty()
  @IsString()
  customerPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Existing customer ID (skips upsert lookup by phone)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'WhatsApp chatId to notify the customer' })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
