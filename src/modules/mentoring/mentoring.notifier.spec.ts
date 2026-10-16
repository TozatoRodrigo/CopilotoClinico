import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { LogMentoringNotifier } from './mentoring.notifier';

describe('LogMentoringNotifier', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs ids and counts, never e-mail or name', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const notifier = new LogMentoringNotifier();

    await notifier.notifyNewRequest({
      requestId: 'req-1',
      recipients: [{ physicianId: 'm-1', email: 'mentor@equipe.com', name: 'Dr. Ripardo' }],
      path: '/mentoria/req-1',
    });
    await notifier.notifyAnswer({
      requestId: 'req-1',
      encounterId: 'enc-1',
      recipient: { physicianId: 'dr-1', email: 'medico@hospital.com', name: 'Dra. A' },
      path: '/encounters/enc-1',
    });

    const lines = log.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual([
      'MENTORING_NOTIFY event=new_request requestId=req-1 recipients=1 channel=log',
      'MENTORING_NOTIFY event=answer requestId=req-1 encounterId=enc-1 channel=log',
    ]);
    expect(lines.join('\n')).not.toMatch(/@|Ripardo|Dra\. A/);
  });
});
