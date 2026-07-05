import { resolveOrderWaTarget } from './order-wa-target.util';

describe('resolveOrderWaTarget', () => {
  it('extracts waChatId and session from stateKey-style chatId', () => {
    expect(
      resolveOrderWaTarget({
        chatId: 'session_abc::51987752653@lid',
        customerPhone: '51987752653',
      }),
    ).toEqual({
      chatId: '51987752653@lid',
      waSessionId: 'session_abc',
    });
  });

  it('uses plain waChatId when no session prefix', () => {
    expect(
      resolveOrderWaTarget({
        chatId: '51987752653@c.us',
        customerPhone: '51987752653',
      }),
    ).toEqual({ chatId: '51987752653@c.us' });
  });

  it('falls back to phone when chatId missing', () => {
    expect(
      resolveOrderWaTarget({
        chatId: null,
        customerPhone: '+51 987 752 653',
      }),
    ).toEqual({ chatId: '51987752653@c.us' });
  });
});
