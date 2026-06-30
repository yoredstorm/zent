import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendWaMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;
}
