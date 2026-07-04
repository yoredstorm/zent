import { NovitaBalanceService } from './novita-balance.service';

describe('NovitaBalanceService balance status', () => {
  function createService(balanceUsd: number | null, overrides?: Record<string, string>) {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => overrides?.[key] ?? defaultValue ?? ''),
    };
    const vendorNotify = {
      notifyNovitaLowBalance: jest.fn(),
    };
    const service = new NovitaBalanceService(config as any, vendorNotify as any);
    jest.spyOn(service, 'getAvailableBalanceUsd').mockResolvedValue(balanceUsd);
    return { service, vendorNotify };
  }

  it('does not mark low balance above threshold', async () => {
    const { service, vendorNotify } = createService(8.87, {
      NOVITA_LOW_BALANCE_ALERT_USD: '3',
    });

    await expect(service.getBalanceStatus(true)).resolves.toEqual(
      expect.objectContaining({
        balanceUsd: 8.87,
        lowBalanceThresholdUsd: 3,
        lowBalance: false,
        alertSentAt: null,
      }),
    );
    expect(vendorNotify.notifyNovitaLowBalance).not.toHaveBeenCalled();
  });

  it('sends one low balance alert inside cooldown', async () => {
    const { service, vendorNotify } = createService(2.99, {
      NOVITA_LOW_BALANCE_ALERT_USD: '3',
      NOVITA_LOW_BALANCE_ALERT_COOLDOWN_MINUTES: '360',
    });

    const first = await service.getBalanceStatus(true);
    const second = await service.getBalanceStatus(true);

    expect(first.lowBalance).toBe(true);
    expect(second.lowBalance).toBe(true);
    expect(vendorNotify.notifyNovitaLowBalance).toHaveBeenCalledTimes(1);
  });

  it('clears alert state when balance recovers', async () => {
    const { service, vendorNotify } = createService(2.5, {
      NOVITA_LOW_BALANCE_ALERT_USD: '3',
    });
    await service.getBalanceStatus(true);
    jest.spyOn(service, 'getAvailableBalanceUsd').mockResolvedValue(3);

    await expect(service.getBalanceStatus(true)).resolves.toEqual(
      expect.objectContaining({
        balanceUsd: 3,
        lowBalance: false,
        alertSentAt: null,
      }),
    );
    expect(vendorNotify.notifyNovitaLowBalance).toHaveBeenCalledTimes(1);
  });
});
