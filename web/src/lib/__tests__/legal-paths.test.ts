import { describe, it, expect } from 'vitest';
import { legalAcceptanceHref, safeReturnPath } from '../legal-paths';

describe('legal-paths (CC-905)', () => {
  it('keeps where the physician was, to return after accepting', () => {
    expect(legalAcceptanceHref('/encounters/abc')).toBe('/aceite-termos?from=%2Fencounters%2Fabc');
    expect(safeReturnPath('/encounters/abc')).toBe('/encounters/abc');
  });

  it('falls back to the dashboard for anything that is not an internal path', () => {
    for (const from of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil']) {
      expect(safeReturnPath(from)).toBe('/dashboard');
    }
  });

  it('never returns to the acceptance screen itself', () => {
    expect(safeReturnPath('/aceite-termos')).toBe('/dashboard');
    expect(safeReturnPath('/aceite-termos?from=/x')).toBe('/dashboard');
    expect(legalAcceptanceHref('/aceite-termos')).toBe('/aceite-termos');
    expect(legalAcceptanceHref('/dashboard')).toBe('/aceite-termos');
  });
});
