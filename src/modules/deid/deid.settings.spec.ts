import { describe, expect, it } from 'vitest';
import { configWith } from '../../../tests/helpers/fake-deid';
import {
  DEFAULT_DEID_SERVICE_URL,
  DEFAULT_DEID_TIMEOUT_MS,
  deidTimeoutFor,
  readDeidMode,
  readDeidServiceUrl,
  readDeidTimeoutMs,
} from './deid.settings';

describe('deid.settings (CC-203)', () => {
  it('DEID_MODE: regex por padrão; typo cai em regex', () => {
    expect(readDeidMode(configWith({}))).toBe('regex');
    expect(readDeidMode(configWith({ DEID_MODE: 'modelo' }))).toBe('regex');
    expect(readDeidMode(configWith({ DEID_MODE: ' Model ' }))).toBe('model');
  });

  it('DEID_SERVICE_URL: o serviço do compose por padrão, sem barra no fim', () => {
    expect(readDeidServiceUrl(configWith({}))).toBe(DEFAULT_DEID_SERVICE_URL);
    expect(readDeidServiceUrl(configWith({ DEID_SERVICE_URL: ' ' }))).toBe(
      DEFAULT_DEID_SERVICE_URL,
    );
    expect(readDeidServiceUrl(configWith({ DEID_SERVICE_URL: 'http://127.0.0.1:8099/' }))).toBe(
      'http://127.0.0.1:8099',
    );
  });

  it('DEID_TIMEOUT_MS: inteiro positivo; o resto cai no padrão', () => {
    expect(readDeidTimeoutMs(configWith({}))).toBe(DEFAULT_DEID_TIMEOUT_MS);
    expect(readDeidTimeoutMs(configWith({ DEID_TIMEOUT_MS: '250' }))).toBe(250);
    for (const invalid of ['', '0', '-5', '1.5', 'rápido']) {
      expect(readDeidTimeoutMs(configWith({ DEID_TIMEOUT_MS: invalid }))).toBe(
        DEFAULT_DEID_TIMEOUT_MS,
      );
    }
  });

  it('o teto cresce com o texto: DEID_TIMEOUT_MS a cada 2 mil caracteres', () => {
    const config = configWith({ DEID_TIMEOUT_MS: '300' });
    expect(deidTimeoutFor(config, 0)).toBe(300);
    expect(deidTimeoutFor(config, 2000)).toBe(300);
    expect(deidTimeoutFor(config, 2001)).toBe(600);
    expect(deidTimeoutFor(config, 21_000)).toBe(3300);
  });
});
