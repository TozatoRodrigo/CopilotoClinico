import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CrmCheckerService } from './crm-checker.service';

function buildService(crmVerificationUrl?: string) {
  const config = new ConfigService({
    CRM_VERIFICATION_URL: crmVerificationUrl,
  });
  return new CrmCheckerService(config);
}

describe('CrmCheckerService.check', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns unavailable when CRM_VERIFICATION_URL is not configured', async () => {
    const service = buildService(undefined);
    const result = await service.check('SP', '123456');
    expect(result).toEqual({ valid: false, source: 'unavailable' });
  });

  it('returns valid when API responds with { ativo: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ativo: true }),
      }),
    );

    const service = buildService('https://cfm-api.example.com/verify');
    const resultPromise = service.check('SP', '123456');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.valid).toBe(true);
    expect(result.source).toBe('cfm_api');
  });

  it('returns invalid when API responds with { ativo: false }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ativo: false }),
      }),
    );

    const service = buildService('https://cfm-api.example.com/verify');
    const resultPromise = service.check('SP', '123456');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.valid).toBe(false);
    expect(result.source).toBe('cfm_api');
  });

  it('returns invalid when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => JSON.stringify({ ativo: true }),
      }),
    );

    const service = buildService('https://cfm-api.example.com/verify');
    const resultPromise = service.check('SP', '123456');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.valid).toBe(false);
  });

  it('returns unavailable after exhausting retries on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const service = buildService('https://cfm-api.example.com/verify');
    const resultPromise = service.check('SP', '123456');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ valid: false, source: 'unavailable' });
  });

  it('parses text body containing "ativo" as valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'Médico ATIVO no CRM',
      }),
    );

    const service = buildService('https://cfm-api.example.com/verify');
    const resultPromise = service.check('RJ', '654321');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.valid).toBe(true);
    expect(result.source).toBe('cfm_api');
  });
});
