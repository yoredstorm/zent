import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface StartTurnInput {
  stateKey: string;
  chatId: string;
  waSessionId?: string;
  mode: 'ai' | 'legacy' | 'n8n_chat' | 'routing_skipped' | 'handoff_silent';
  userMessage?: string;
}

export interface ToolLogEntry {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  at: string;
}

@Injectable()
export class BotTurnLogService {
  constructor(private prisma: PrismaService) {}

  async startTurn(input: StartTurnInput): Promise<string> {
    const row = await this.prisma.botTurnLog.create({
      data: {
        stateKey: input.stateKey,
        chatId: input.chatId,
        waSessionId: input.waSessionId,
        mode: input.mode,
        userMessage: input.userMessage,
        toolsJson: [],
      },
    });
    return row.id;
  }

  async appendTool(logId: string, entry: Omit<ToolLogEntry, 'at'>): Promise<void> {
    const row = await this.prisma.botTurnLog.findUnique({ where: { id: logId } });
    if (!row) return;
    const tools = Array.isArray(row.toolsJson)
      ? (row.toolsJson as unknown as ToolLogEntry[])
      : [];
    tools.push({ ...entry, at: new Date().toISOString() });
    await this.prisma.botTurnLog.update({
      where: { id: logId },
      data: { toolsJson: tools as unknown as Prisma.InputJsonValue },
    });
  }

  async completeTurn(logId: string, assistantMessage: string, durationMs?: number): Promise<void> {
    await this.prisma.botTurnLog.update({
      where: { id: logId },
      data: {
        assistantMessage,
        durationMs: durationMs ?? undefined,
      },
    });
  }

  async failTurn(logId: string, error: string, assistantMessage?: string): Promise<void> {
    await this.prisma.botTurnLog.update({
      where: { id: logId },
      data: {
        error,
        assistantMessage: assistantMessage ?? undefined,
      },
    });
  }

  async listForChat(chatId: string, limit = 50) {
    const decoded = decodeURIComponent(chatId);
    return this.prisma.botTurnLog.findMany({
      where: {
        OR: [{ chatId: decoded }, { chatId }],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }
}
