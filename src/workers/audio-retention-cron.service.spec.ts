import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { AudioRetentionCronService } from './audio-retention-cron.service';
import { AudioRetentionService } from '../modules/audio/audio-retention.service';

describe('AudioRetentionCronService', () => {
  let service: AudioRetentionCronService;
  let retention: { purgeExpired: ReturnType<typeof vi.fn> };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let previousDsn: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    retention = { purgeExpired: vi.fn() };
    service = new AudioRetentionCronService(retention as unknown as AudioRetentionService);
    logger = service['logger'] as unknown as typeof logger;
    logger.log = vi.fn();
    logger.debug = vi.fn();
    logger.error = vi.fn();
    previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
  });

  afterEach(() => {
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
  });

  it('logs the purge summary without alerting when every capture was purged', async () => {
    retention.purgeExpired.mockResolvedValue({ purged: 3, failed: 0 });

    await service.purgeExpiredAudio();

    expect(logger.log).toHaveBeenCalledWith('Audio retention purge: 3 purged, 0 failed');
    expect(logger.error).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('stays quiet when nothing expired', async () => {
    retention.purgeExpired.mockResolvedValue({ purged: 0, failed: 0 });

    await service.purgeExpiredAudio();

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledOnce();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('alerts Sentry with counts only when expired captures still hold audio', async () => {
    retention.purgeExpired.mockResolvedValue({ purged: 5, failed: 2 });

    await service.purgeExpiredAudio();

    expect(logger.error).toHaveBeenCalledWith(
      'AUDIO RETENTION PURGE INCOMPLETE — 2 expired capture(s) still hold audio',
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith('Audio retention purge incomplete', {
      level: 'error',
      tags: { component: 'audio', job: 'audio-retention-purge' },
      extra: { purged: 5, failed: 2 },
    });
  });

  it('logs and reports unexpected exceptions without rethrowing', async () => {
    const error = new Error('db down');
    retention.purgeExpired.mockRejectedValue(error);

    await expect(service.purgeExpiredAudio()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Audio retention purge failed with exception: db down',
      expect.any(String),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { component: 'audio', job: 'audio-retention-purge' },
    });
  });

  it('does not call Sentry when SENTRY_DSN is unset (still logs the error)', async () => {
    delete process.env.SENTRY_DSN;
    retention.purgeExpired.mockResolvedValue({ purged: 0, failed: 1 });

    await service.purgeExpiredAudio();

    expect(logger.error).toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
