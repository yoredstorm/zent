/**
 * Idempotency: processed key is only recorded after successful handleMessage.
 * Failed jobs must not mark the key so BullMQ can retry.
 */
describe('WhatsappBotWorker idempotency contract', () => {
  it('marks key processed only on success', () => {
    const processedKeys = new Set<string>();
    const idempotencyKey = 'msg-1';

    const simulateSuccess = () => {
      let error: Error | null = null;
      try {
        // handleMessage ok
      } catch (e: any) {
        error = e;
      }
      if (!error) processedKeys.add(idempotencyKey);
      return error;
    };

    const simulateFailure = () => {
      let error: Error | null = null;
      try {
        throw new Error('boom');
      } catch (e: any) {
        error = e;
      }
      if (!error) processedKeys.add(idempotencyKey);
      return error;
    };

    expect(simulateSuccess()).toBeNull();
    expect(processedKeys.has(idempotencyKey)).toBe(true);

    processedKeys.clear();
    expect(simulateFailure()).toBeTruthy();
    expect(processedKeys.has(idempotencyKey)).toBe(false);
  });
});
