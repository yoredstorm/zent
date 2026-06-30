import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendWaMediaDto {
  @ApiProperty({ enum: ['image', 'document'] })
  @IsIn(['image', 'document'])
  type!: 'image' | 'document';

  @ApiProperty({ description: 'Public or internal URL of uploaded file' })
  @IsString()
  @MinLength(1)
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;
}
