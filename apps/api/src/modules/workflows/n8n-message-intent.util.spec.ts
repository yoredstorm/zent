import { isGreetingLikeMessage, normalizeChatMessage } from './n8n-message-intent.util';

describe('n8n-message-intent.util', () => {
  it('normalizes markdown and punctuation from hola', () => {
    expect(normalizeChatMessage('*hola*')).toBe('hola');
    expect(normalizeChatMessage('  Hola!  ')).toBe('hola');
  });

  it('detects greeting variants', () => {
    expect(isGreetingLikeMessage('hola')).toBe(true);
    expect(isGreetingLikeMessage('*hola*')).toBe(true);
    expect(isGreetingLikeMessage('buenas tardes')).toBe(true);
    expect(isGreetingLikeMessage('catalogo')).toBe(false);
  });
});
