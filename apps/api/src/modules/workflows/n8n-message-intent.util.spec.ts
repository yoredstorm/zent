import {
  isBrowsePhase,
  isGreetingLikeMessage,
} from './n8n-message-intent.util';

describe('n8n-message-intent.util', () => {
  it('does not treat menu numbers as greetings', () => {
    expect(isGreetingLikeMessage('1')).toBe(false);
    expect(isGreetingLikeMessage('2')).toBe(false);
    expect(isGreetingLikeMessage('10')).toBe(false);
  });

  it('still detects real greetings', () => {
    expect(isGreetingLikeMessage('hola')).toBe(true);
    expect(isGreetingLikeMessage('buenas noches')).toBe(true);
  });

  it('marks browse phases', () => {
    expect(isBrowsePhase('browse_products')).toBe(true);
    expect(isBrowsePhase('product_detail')).toBe(true);
    expect(isBrowsePhase('main_menu')).toBe(false);
  });
});
