import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBotAiDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  botAiEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  botAiBusinessDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  botAiPolicies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  botAiPlaybook?: string;

  @ApiPropertyOptional({ description: 'Novita API key (solo si se desea actualizar)' })
  @IsOptional()
  @IsString()
  novitaApiKey?: string;

  @ApiPropertyOptional({ description: 'Sincroniza NOVITA_BOT_ENABLED en .env' })
  @IsOptional()
  @IsBoolean()
  novitaBotEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Sincroniza N8N_WORKFLOWS_ENABLED en .env' })
  @IsOptional()
  @IsBoolean()
  n8nWorkflowsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Base URL de webhooks n8n, ej. https://n8n.example.com/webhook/zent' })
  @IsOptional()
  @IsString()
  n8nWebhookBaseUrl?: string;

  @ApiPropertyOptional({ description: 'Secreto HMAC para webhooks n8n (solo si se desea actualizar)' })
  @IsOptional()
  @IsString()
  n8nWebhookSecret?: string;
}
