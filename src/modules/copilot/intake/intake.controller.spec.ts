import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, toArray } from 'rxjs';
import type { StreamEvent } from '../orchestrator/orchestrator.service';
import type { ConversationService } from './conversation.service';
import { IntakeController } from './intake.controller';
import type { IntakeService } from './intake.service';

const req = { user: { physicianId: 'phys-001' } };
const encounterId = 'enc-001';
const intakeId = '00000000-0000-4000-8000-000000000001';

function controllerWith(streamEvents: StreamEvent[]) {
  const conversation = {
    stream: vi.fn(async function* () {
      for (const event of streamEvents) yield event;
    }),
  };
  const controller = new IntakeController(
    {} as unknown as IntakeService,
    conversation as unknown as ConversationService,
  );
  return { controller, conversation };
}

describe('IntakeController.stream', () => {
  it('sends the plan events and completes after done', async () => {
    const done = { type: 'done', result: { interactionId: 'interaction-001' } } as StreamEvent;
    const { controller, conversation } = controllerWith([{ type: 'delta', delta: '{' }, done]);

    const events = await lastValueFrom(
      controller.stream(req, encounterId, intakeId).pipe(toArray()),
    );

    expect(conversation.stream).toHaveBeenCalledWith('phys-001', encounterId, intakeId);
    expect(events).toEqual([{ data: { type: 'delta', delta: '{' } }, { data: done }]);
  });

  it('completes after an error event', async () => {
    const { controller } = controllerWith([{ type: 'error', errors: ['falhou'] }]);

    const events = await lastValueFrom(
      controller.stream(req, encounterId, intakeId).pipe(toArray()),
    );

    expect(events).toEqual([{ data: { type: 'error', errors: ['falhou'] } }]);
  });
});
