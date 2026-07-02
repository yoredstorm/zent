import { splitWhatsAppMessage } from './bot-ai-orchestrator.service';

describe('splitWhatsAppMessage', () => {
  it('returns single chunk for short text', () => {
    expect(splitWhatsAppMessage('Hola, ¿en qué te ayudo?')).toEqual(['Hola, ¿en qué te ayudo?']);
  });

  it('splits long text into multiple chunks under max length', () => {
    const long = 'a'.repeat(950);
    const parts = splitWhatsAppMessage(long, 400);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(400);
    }
  });

  it('preserves paragraph breaks when possible', () => {
    const text = 'Primer párrafo.\n\nSegundo párrafo con más detalle.';
    const parts = splitWhatsAppMessage(text, 900);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain('Primer párrafo');
  });
});
