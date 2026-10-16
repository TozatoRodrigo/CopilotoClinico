import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configWith, fakeNameModel } from '../../../tests/helpers/fake-deid';
import type { ModelEntity } from '../copilot/guardrails/model-entities';
import { DeidModelError, type DeidModelClient } from './deid-model.client';
import { DeidentificationService, REGEX_ONLY_DEIDENTIFIER } from './deidentification.service';

const CASE =
  'Maria da Silva, 54 anos, tel (11) 98877-6655, cefaleia há 2 dias. Kernig negativo. Prontuário 4587213.';

function failing(error: unknown): DeidModelClient & { calls: number } {
  const client = {
    calls: 0,
    findEntities: () => {
      client.calls += 1;
      return Promise.reject(error);
    },
  };
  return client;
}

describe('DeidentificationService (CC-203)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('DEID_MODE ausente: só a regex, sem chamar o serviço', async () => {
    const model = fakeNameModel(['Maria da Silva']);
    const service = new DeidentificationService(configWith({}), model);

    const result = await service.deidentify(CASE, 'case');

    expect(model.received).toEqual([]);
    expect(result).toEqual(await REGEX_ONLY_DEIDENTIFIER.deidentify(CASE, 'case'));
    expect(result.mode).toBe('regex');
    expect(result.redacted).toContain('Maria da Silva');
  });

  it('regex → modelo: o serviço recebe o texto já sem telefone e prontuário', async () => {
    const model = fakeNameModel(['Maria da Silva']);
    const service = new DeidentificationService(configWith({ DEID_MODE: 'model' }), model);

    const result = await service.deidentify(CASE, 'case');

    expect(model.received).toHaveLength(1);
    expect(model.received[0]).toContain('[REDACTED_PHONE]');
    expect(model.received[0]).toContain('[REDACTED_RECORD]');
    expect(model.received[0]).not.toContain('98877');
    expect(result.redacted).toBe(
      '[NOME], 54 anos, tel [REDACTED_PHONE], cefaleia há 2 dias. Kernig negativo. Prontuário [REDACTED_RECORD].',
    );
    expect(result).toMatchObject({
      hasPII: true,
      mode: 'model',
      fallback: null,
      counts: { name: 1, phone: 1, record: 1 },
    });
  });

  it('modelo → epônimos: trecho que toca termo protegido não leva o termo', async () => {
    const client: DeidModelClient = {
      findEntities: (text) => {
        const start = text.indexOf('Kernig');
        const entities: ModelEntity[] = [
          { label: 'LASTNAME', start, end: start + 'Kernig'.length, score: 0.8 },
        ];
        return Promise.resolve(entities);
      },
    };
    const service = new DeidentificationService(configWith({ DEID_MODE: 'model' }), client);

    const result = await service.deidentify(CASE, 'case');

    expect(result.redacted).toContain('Kernig negativo');
    expect(result.mode).toBe('model');
  });

  it('o teto do serviço cresce com o tamanho do texto', async () => {
    const timeouts: number[] = [];
    const client: DeidModelClient = {
      findEntities: (_text, timeoutMs) => {
        timeouts.push(timeoutMs);
        return Promise.resolve([]);
      },
    };
    const service = new DeidentificationService(
      configWith({ DEID_MODE: 'model', DEID_TIMEOUT_MS: '200' }),
      client,
    );

    await service.deidentify('febre', 'case');
    await service.deidentify('febre '.repeat(1000), 'attachment');

    expect(timeouts).toEqual([200, 600]);
  });

  it('texto vazio depois da regex não vai ao serviço', async () => {
    const model = fakeNameModel([]);
    const service = new DeidentificationService(configWith({ DEID_MODE: 'model' }), model);

    await service.deidentify('   ', 'answer');

    expect(model.received).toEqual([]);
  });

  it.each([
    ['timeout', new DeidModelError('timeout')],
    ['unavailable', new DeidModelError('unavailable')],
    ['bad_status', new DeidModelError('bad_status', 500)],
    ['bad_response', new Error('bug no combinador')],
  ])(
    'serviço com %s: segue só com a regex e loga DEID_FALLBACK sem texto',
    async (reason, error) => {
      const client = failing(error);
      const service = new DeidentificationService(configWith({ DEID_MODE: 'model' }), client);

      const result = await service.deidentify(CASE, 'transcription');

      expect(client.calls).toBe(1);
      expect(result.redacted).toBe(
        (await REGEX_ONLY_DEIDENTIFIER.deidentify(CASE, 'case')).redacted,
      );
      expect(result).toMatchObject({ mode: 'regex', fallback: reason });
      const lines = warnSpy.mock.calls.map((call: unknown[]) => String(call[0]));
      expect(lines).toEqual([
        expect.stringContaining(`DEID_FALLBACK stage=transcription reason=${reason}`),
      ]);
      expect(lines.join('\n')).not.toMatch(/Maria|Silva|cefaleia/);
    },
  );

  it('log do caminho feliz: etapa, contagens e latência, nunca o texto', async () => {
    const service = new DeidentificationService(
      configWith({ DEID_MODE: 'model' }),
      fakeNameModel(['Maria da Silva']),
    );

    await service.deidentify(CASE, 'answer');

    const lines = logSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(lines).toEqual([
      expect.stringMatching(
        /^DEID stage=answer mode=model latencyMs=\d+ chars=\d+ regex=2 entities=1 masked=1 requestId=-$/,
      ),
    ]);
    expect(lines.join('\n')).not.toMatch(/Maria|Silva|cefaleia/);
  });
});
