import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { lastValueFrom, toArray } from 'rxjs';

describe('CopilotController', () => {
  let controller: CopilotController;
  let serviceMock: {
    analyze: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
    respond: ReturnType<typeof vi.fn>;
  };

  const req = { user: { physicianId: 'phys-001' } };
  const encounterId = 'enc-001';
  const body = {
    caseText: 'Paciente com dor torácica aguda e dispneia há 2 horas',
    context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
  };

  const analyzeResult = {
    interactionId: 'interaction-001',
    output: { reasoning: 'test', recommendations: [], uncertainty: false, uncertaintyReason: null, differentials: [] },
    citations: [],
    metadata: { piiDetected: false, injectionDetected: false, chunksRetrieved: 0, latencyMs: 100, cost: 0.001, model: 'test' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock = { analyze: vi.fn(), stream: vi.fn(), respond: vi.fn() };
    controller = new CopilotController(serviceMock as unknown as CopilotService);
  });

  describe('analyze', () => {
    it('delegates to service.analyze and returns result', async () => {
      serviceMock.analyze.mockResolvedValue(analyzeResult);

      const result = await controller.analyze(req, encounterId, body);

      expect(serviceMock.analyze).toHaveBeenCalledWith('phys-001', encounterId, body);
      expect(result).toEqual(analyzeResult);
    });
  });

  describe('DEC-002: respond', () => {
    const respondBody = {
      interactionId: 'interaction-001',
      answers: [{ questionId: 'q1', answer: 'sim' }],
    };

    it('delegates to service.respond and returns result', async () => {
      serviceMock.respond.mockResolvedValue(analyzeResult);

      const result = await controller.respond(req, encounterId, respondBody);

      expect(serviceMock.respond).toHaveBeenCalledWith('phys-001', encounterId, respondBody);
      expect(result).toEqual(analyzeResult);
    });
  });

  describe('RT-001: stream', () => {
    async function* fakeGen() {
      yield { type: 'delta' as const, delta: 'hello' };
      yield { type: 'done' as const, result: analyzeResult };
    }

    it('returns an Observable that emits MessageEvents from the generator', async () => {
      serviceMock.stream.mockReturnValue(fakeGen());

      const query = { caseText: body.caseText, hasCT: true, isSus: false, hasLab: true, hasICU: false };
      const observable = controller.stream(req, encounterId, query);

      const events = await lastValueFrom(observable.pipe(toArray()));

      expect(serviceMock.stream).toHaveBeenCalledWith('phys-001', encounterId, {
        caseText: body.caseText,
        context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
      });
      expect(events).toHaveLength(2);
      expect(events[0]?.data).toEqual({ type: 'delta', delta: 'hello' });
      expect(events[1]?.data).toMatchObject({ type: 'done' });
    });

    it('completes observable after done event', async () => {
      serviceMock.stream.mockReturnValue(fakeGen());

      const query = { caseText: body.caseText, hasCT: false, isSus: false, hasLab: false, hasICU: false };
      const observable = controller.stream(req, encounterId, query);

      let completed = false;
      await new Promise<void>((resolve) => {
        observable.subscribe({
          complete: () => { completed = true; resolve(); },
          error: resolve,
        });
      });

      expect(completed).toBe(true);
    });
  });
});
