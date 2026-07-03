import { BotTurnLogService } from './bot-turn-log.service';

describe('BotTurnLogService', () => {
  const prisma = {
    botTurnLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new BotTurnLogService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('startTurn creates a row with empty tools', async () => {
    prisma.botTurnLog.create.mockResolvedValue({ id: 'log-1' });
    const id = await service.startTurn({
      stateKey: 'sess::51999@c.us',
      chatId: '51999@c.us',
      mode: 'ai',
      userMessage: 'hola',
    });
    expect(id).toBe('log-1');
    expect(prisma.botTurnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toolsJson: [] }),
      }),
    );
  });

  it('appendTool merges into toolsJson array', async () => {
    prisma.botTurnLog.findUnique.mockResolvedValue({
      id: 'log-1',
      toolsJson: [{ name: 'search_products', args: {}, at: 't0' }],
    });
    prisma.botTurnLog.update.mockResolvedValue({});
    await service.appendTool('log-1', {
      name: 'add_to_cart',
      args: { productId: 'p1', quantity: 2 },
      result: { ok: true },
    });
    expect(prisma.botTurnLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          toolsJson: expect.arrayContaining([
            expect.objectContaining({ name: 'search_products' }),
            expect.objectContaining({ name: 'add_to_cart' }),
          ]),
        },
      }),
    );
  });
});
