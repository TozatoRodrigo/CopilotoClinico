import { afterEach, describe, expect, it } from 'vitest';
import {
  isAnalyticsRevoked,
  isConsentStatus,
  readAnalyticsOptOut,
  UMAMI_DISABLED_KEY,
  writeAnalyticsOptOut,
  type ConsentStatus,
} from '../analytics-consent';

function analytics(overrides: Partial<ConsentStatus>): ConsentStatus {
  return { scope: 'analytics', granted: false, revokedAt: null, ...overrides };
}

// CC-014 — a trava é a revogação: sem registro a contagem segue como sempre.
describe('isAnalyticsRevoked', () => {
  it('is revoked when the latest analytics record was revoked', () => {
    expect(isAnalyticsRevoked([analytics({ revokedAt: '2026-10-15T12:00:00.000Z' })])).toBe(true);
  });

  it('is not revoked without any record (never granted, never revoked)', () => {
    expect(isAnalyticsRevoked([analytics({})])).toBe(false);
    expect(isAnalyticsRevoked([])).toBe(false);
  });

  it('is not revoked while granted', () => {
    expect(isAnalyticsRevoked([analytics({ granted: true })])).toBe(false);
  });

  it('ignores the other scopes', () => {
    expect(
      isAnalyticsRevoked([
        { scope: 'ai_processing', granted: false, revokedAt: '2026-10-15T12:00:00.000Z' },
        analytics({ granted: true }),
      ]),
    ).toBe(false);
  });
});

describe('isConsentStatus', () => {
  it('accepts the GET /lgpd/consent item and refuses anything else', () => {
    expect(
      isConsentStatus({ scope: 'analytics', granted: true, grantedAt: null, revokedAt: null }),
    ).toBe(true);
    expect(isConsentStatus({ scope: 'analytics', granted: 'yes', revokedAt: null })).toBe(false);
    expect(isConsentStatus(null)).toBe(false);
  });
});

describe('umami.disabled opt-out', () => {
  afterEach(() => window.localStorage.clear());

  it('writes the key the Umami script reads, and clears it again', () => {
    writeAnalyticsOptOut(true);
    expect(window.localStorage.getItem(UMAMI_DISABLED_KEY)).toBe('1');
    expect(readAnalyticsOptOut()).toBe(true);

    writeAnalyticsOptOut(false);
    expect(window.localStorage.getItem(UMAMI_DISABLED_KEY)).toBeNull();
    expect(readAnalyticsOptOut()).toBe(false);
  });
});
