import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { AuditChainCronService } from './audit-chain-cron.service';
import { AuditService } from '../modules/audit/audit.service';
import type { ChainVerificationResult } from '../modules/audit/audit.service';

const captureMessage = Sentry.captureMessage as unknown as ReturnType<typeof vi.fn>;

const noLegacy: ChainVerificationResult['legacy'] = {
  verified: 0,
  unverifiable: 0,
  unverifiableSample: [],
};

describe('AuditChainCronService', () => {
  let previousDsn: string | undefined;

  beforeEach(() => {
    captureMessage.mockClear();
    previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
  });

  afterEach(() => {
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
  });

  function buildSubject(resultOrError: ChainVerificationResult | Error) {
    const auditService = {
      verifyChain: vi.fn(),
    };

    if (resultOrError instanceof Error) {
      auditService.verifyChain.mockRejectedValue(resultOrError);
    } else {
      auditService.verifyChain.mockResolvedValue(resultOrError);
    }

    const service = new AuditChainCronService(auditService as unknown as AuditService);
    const logger = service['logger'] as unknown as {
      log: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
    logger.log = vi.fn();
    logger.error = vi.fn();

    return { auditService, logger, service };
  }

  it('logs a pass message when the audit chain is intact', async () => {
    const { auditService, logger, service } = buildSubject({
      valid: true,
      count: 42,
      legacy: noLegacy,
    });

    await service.verifyAuditChain();

    expect(auditService.verifyChain).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'Audit chain verification PASSED — 42 records verified (legacy: 0 verified, 0 unverifiable)',
    );
  });

  it('não alarma "legado não verificável": só informa a contagem', async () => {
    const { logger, service } = buildSubject({
      valid: true,
      count: 120,
      legacy: {
        verified: 95,
        unverifiable: 2,
        unverifiableSample: [
          { id: 'audit-010', reason: 'key-order-search-limit' },
          { id: 'audit-011', reason: 'rewritten-number' },
        ],
      },
    });

    await service.verifyAuditChain();

    expect(logger.error).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'Audit chain verification PASSED — 120 records verified (legacy: 95 verified, 2 unverifiable)',
    );
  });

  it('emits a security alert with the suspicious record id when the chain is broken', async () => {
    const { logger, service } = buildSubject({
      valid: false,
      count: 7,
      brokenAt: 'audit-007',
      message: 'afterHash mismatch at record audit-007',
      legacy: noLegacy,
    });

    await service.verifyAuditChain();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('AUDIT CHAIN INTEGRITY FAILURE'),
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('brokenAt=audit-007'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('count=7'));
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('afterHash mismatch at record audit-007'),
    );
    expect(captureMessage).toHaveBeenCalledWith('AUDIT CHAIN INTEGRITY FAILURE', {
      level: 'error',
      tags: { component: 'audit', check: 'audit-chain-verify' },
      extra: {
        brokenAt: 'audit-007',
        count: 7,
        message: 'afterHash mismatch at record audit-007',
      },
    });
  });

  it('sem SENTRY_DSN o alarme fica só no log', async () => {
    delete process.env.SENTRY_DSN;
    const { logger, service } = buildSubject({
      valid: false,
      count: 1,
      brokenAt: 'audit-001',
      message: 'afterHash mismatch at record audit-001',
      legacy: noLegacy,
    });

    await service.verifyAuditChain();

    expect(logger.error).toHaveBeenCalledOnce();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('logs unexpected verification exceptions as errors', async () => {
    const error = new Error('database unavailable');
    const { logger, service } = buildSubject(error);

    await service.verifyAuditChain();

    expect(logger.error).toHaveBeenCalledWith(
      'Audit chain verification failed with exception: database unavailable',
      error.stack,
    );
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
