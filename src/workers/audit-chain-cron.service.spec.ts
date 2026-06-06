import { describe, expect, it, vi } from 'vitest';
import { AuditChainCronService } from './audit-chain-cron.service';
import { AuditService } from '../modules/audit/audit.service';

describe('AuditChainCronService', () => {
  function buildSubject(resultOrError: unknown) {
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
    const { auditService, logger, service } = buildSubject({ valid: true, count: 42 });

    await service.verifyAuditChain();

    expect(auditService.verifyChain).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'Audit chain verification PASSED — 42 records verified',
    );
  });

  it('emits a security alert with the suspicious record id when the chain is broken', async () => {
    const { logger, service } = buildSubject({
      valid: false,
      count: 7,
      brokenAt: 'audit-007',
      message: 'afterHash mismatch at record audit-007',
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
  });

  it('logs unexpected verification exceptions as errors', async () => {
    const error = new Error('database unavailable');
    const { logger, service } = buildSubject(error);

    await service.verifyAuditChain();

    expect(logger.error).toHaveBeenCalledWith(
      'Audit chain verification failed with exception: database unavailable',
      error.stack,
    );
  });
});
