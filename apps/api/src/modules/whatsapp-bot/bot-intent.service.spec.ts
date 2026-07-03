import { BotIntentService } from './bot-intent.service';

describe('BotIntentService', () => {
  const service = new BotIntentService();

  it('parses agregar N', () => {
    expect(service.parseAddToCartIntent('Agregar 5')).toEqual({ quantity: 5 });
  });

  it('parses añadir with accent', () => {
    expect(service.parseAddToCartIntent('añadir 2')).toEqual({ quantity: 2 });
  });

  it('returns null for unrelated text', () => {
    expect(service.parseAddToCartIntent('quiero una mochila')).toBeNull();
  });
});
