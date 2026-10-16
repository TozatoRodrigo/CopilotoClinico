import { describe, it, expect } from 'vitest';
import { bodyFieldsForLog, pathForLog } from './pii-log-sanitizer.interceptor';

describe('bodyFieldsForLog', () => {
  it('lists the field names and never the values', () => {
    const line = bodyFieldsForLog({
      caseText: 'Maria da Silva, 54 anos, dor torácica',
      context: { hasCT: true },
    });

    expect(line).toBe('caseText,context');
    expect(line).not.toContain('Maria');
  });

  it('describes bodies that are not plain objects', () => {
    expect(bodyFieldsForLog(undefined)).toBe('-');
    expect(bodyFieldsForLog({})).toBe('-');
    expect(bodyFieldsForLog([{ answer: 'sim' }])).toBe('array(1)');
    expect(bodyFieldsForLog('texto livre')).toBe('string');
  });
});

// OPS-003 — a linha de acesso nunca grava a querystring.
describe('pathForLog', () => {
  it('drops the query string, which may carry physician text', () => {
    expect(pathForLog('/v1/guidelines/search?q=dor%20tor%C3%A1cica&limit=5')).toBe(
      '/v1/guidelines/search',
    );
  });

  it('keeps a path without query string unchanged', () => {
    expect(pathForLog('/v1/encounters/enc-1/copilot/respond')).toBe(
      '/v1/encounters/enc-1/copilot/respond',
    );
  });
});
