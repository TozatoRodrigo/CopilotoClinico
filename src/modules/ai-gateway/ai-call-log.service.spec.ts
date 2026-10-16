import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../config/prisma.service';
import { runWithRequestContext } from '../../shared/request-context/request-context';
import { AiCallLogService } from './ai-call-log.service';
import type { AiCallTrace } from './ai-call-trace';

const trace: AiCallTrace = {
  stage: 'decision',
  profile: 'default',
  provider: 'anthropic',
  requestedModel: 'claude-opus-5-5',
  servedModel: 'claude-opus-5-5',
  effort: 'high',
  promptSha256: 'a'.repeat(64),
  responseSchema: 'copilot_output',
  usage: { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 },
  latencyMs: 4200,
  outcome: 'ok',
  errorType: null,
  fallbackFrom: null,
};

function service(create = vi.fn().mockResolvedValue({})) {
  const prisma = { aiCall: { create } } as unknown as PrismaService;
  return { create, log: new AiCallLogService(prisma) };
}

describe('AiCallLogService', () => {
  it('stores the trace with the request context and the computed cost', () => {
    const { create, log } = service();

    runWithRequestContext(
      {
        requestId: 'req-12345678',
        physicianId: '11111111-1111-4111-8111-111111111111',
        encounterId: '22222222-2222-4222-8222-222222222222',
      },
      () => log.record(trace),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'req-12345678',
        physicianId: '11111111-1111-4111-8111-111111111111',
        encounterId: '22222222-2222-4222-8222-222222222222',
        stage: 'decision',
        promptTokens: 1_000_000,
        costUsd: 4,
        latencyMs: 4200,
        outcome: 'ok',
      }),
    });
  });

  it('stores null context outside a request', () => {
    const { create, log } = service();

    log.record({ ...trace, usage: null, outcome: 'error', errorType: 'TypeError' });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestId: null, encounterId: null, costUsd: null }),
    });
  });

  it('marks a call on the fallback model with the profile that went down', () => {
    const { create, log } = service();
    const info = vi.spyOn(
      (log as unknown as { logger: { log: (message: string) => void } }).logger,
      'log',
    );

    log.record({ ...trace, fallbackFrom: 'groq' });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fallbackFrom: 'groq' }),
    });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('fallbackFrom=groq'));
  });

  it('only warns when the database write fails', async () => {
    const { log } = service(vi.fn().mockRejectedValue(new Error('db down')));
    const warn = vi.spyOn(
      (log as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    expect(() => log.record(trace)).not.toThrow();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('AI_CALL_LOG_FAILED')),
    );
  });
});
