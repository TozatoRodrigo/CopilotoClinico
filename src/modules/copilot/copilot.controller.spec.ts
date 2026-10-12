import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CopilotFeedbackService } from './feedback/copilot-feedback.service';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { lastValueFrom, toArray } from 'rxjs';
import { understandingFixture } from '../../../tests/fixtures/case-understanding';
import { MAX_RESPOND_STREAM_ANSWERS_LENGTH } from '../../shared/contracts/clinical';

describe('CopilotController', () => {
  let controller: CopilotController;
  let serviceMock: {
    analyze: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
    respond: ReturnType<typeof vi.fn>;
  };
  let feedbackMock: { submit: ReturnType<typeof vi.fn> };

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
    feedbackMock = { submit: vi.fn().mockResolvedValue({ recorded: true }) };
    controller = new CopilotController(
      serviceMock as unknown as CopilotService,
      feedbackMock as unknown as CopilotFeedbackService,
    );
  });

  describe('analyze', () => {
    it('delegates to service.analyze and returns result', async () => {
      serviceMock.analyze.mockResolvedValue(analyzeResult);

      const result = await controller.analyze(req, encounterId, body);

      expect(serviceMock.analyze).toHaveBeenCalledWith('phys-001', encounterId, body);
      expect(result).toEqual(analyzeResult);
    });
  });

  // F0-D — o reporte vai para a trilha E para a fila de triagem.
  describe('F7: feedback', () => {
    it('records the feedback on behalf of the authenticated physician', async () => {
      const feedbackBody = {
        interactionId: '11111111-1111-4111-8111-111111111111',
        kind: 'wrong_scenario' as const,
        comment: 'Era dengue',
      };

      const result = await controller.feedback(req, encounterId, feedbackBody);

      expect(feedbackMock.submit).toHaveBeenCalledWith('phys-001', encounterId, feedbackBody);
      expect(result).toEqual({ recorded: true });
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

    const noRedFlagsQuery = {
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: false,
      immunosuppressed: false,
      pregnant: false,
      anticoagulant: false,
      pediatric: false,
      elderly65: false,
      allergy: false,
    };

    it('returns an Observable that emits MessageEvents from the generator', async () => {
      serviceMock.stream.mockReturnValue(fakeGen());

      const query = {
        caseText: body.caseText,
        ...noRedFlagsQuery,
        hasCT: true,
        hasLab: true,
      };
      const observable = controller.stream(req, encounterId, query);

      const events = await lastValueFrom(observable.pipe(toArray()));

      expect(serviceMock.stream).toHaveBeenCalledWith('phys-001', encounterId, {
        caseText: body.caseText,
        context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
        redFlags: {
          immunosuppressed: false,
          pregnant: false,
          anticoagulant: false,
          pediatric: false,
          elderly65: false,
          allergy: false,
        },
      });
      expect(events).toHaveLength(2);
      expect(events[0]?.data).toEqual({ type: 'delta', delta: 'hello' });
      expect(events[1]?.data).toMatchObject({ type: 'done' });
    });

    // UX-06 — paridade com POST /analyze: red flags confirmadas pelo médico
    // não podem se perder só porque o caminho é streaming/GET.
    it('forwards physician-confirmed red flags from individual query params (S20-CLIN-01 parity)', async () => {
      serviceMock.stream.mockReturnValue(fakeGen());

      const query = {
        caseText: body.caseText,
        ...noRedFlagsQuery,
        pregnant: true,
        anticoagulant: true,
      };
      const observable = controller.stream(req, encounterId, query);
      // Observable é lazy (cold) — o generator só é chamado ao inscrever.
      await lastValueFrom(observable.pipe(toArray()));

      expect(serviceMock.stream).toHaveBeenCalledWith(
        'phys-001',
        encounterId,
        expect.objectContaining({
          redFlags: expect.objectContaining({ pregnant: true, anticoagulant: true }),
        }),
      );
    });

    // F0-C — paridade de `params`: a tag de funil chega ao orquestrador também
    // pelo streaming.
    it('forwards the demoCase funnel tag', async () => {
      serviceMock.stream.mockReturnValue(fakeGen());

      const query = { caseText: body.caseText, ...noRedFlagsQuery, demoCase: 'sindrome-gripal' };
      await lastValueFrom(controller.stream(req, encounterId, query).pipe(toArray()));

      expect(serviceMock.stream).toHaveBeenCalledWith(
        'phys-001',
        encounterId,
        expect.objectContaining({ demoCase: 'sindrome-gripal' }),
      );
    });

    // F1 — o entendimento do caso (ADR-013) chega ao navegador como evento
    // SSE próprio, antes dos deltas, no mesmo formato `data: <json>`.
    it('forwards the understanding event before the deltas', async () => {
      const understanding = understandingFixture();
      async function* stagesGen() {
        yield { type: 'understanding' as const, understanding };
        yield { type: 'delta' as const, delta: '{' };
        yield { type: 'done' as const, result: analyzeResult };
      }
      serviceMock.stream.mockReturnValue(stagesGen());

      const query = { caseText: body.caseText, ...noRedFlagsQuery };
      const events = await lastValueFrom(
        controller.stream(req, encounterId, query).pipe(toArray()),
      );

      expect(events.map((event) => (event.data as { type: string }).type)).toEqual([
        'understanding',
        'delta',
        'done',
      ]);
      expect(events[0]?.data).toEqual({ type: 'understanding', understanding });
    });

    it('completes observable after done event', async () => {
      serviceMock.stream.mockReturnValue(fakeGen());

      const query = { caseText: body.caseText, ...noRedFlagsQuery };
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

// Reanálise por streaming: EventSource só faz GET, então as respostas chegam
// como JSON na querystring e precisam passar pelo mesmo schema do POST.
describe('CopilotController — respond/stream', () => {
  const req = { user: { physicianId: 'phys-001' } };
  const encounterId = 'enc-001';
  const interactionId = '11111111-1111-4111-8111-111111111111';
  const answers = [
    { questionId: 'q-glicemia', answer: '112' },
    { questionId: 'q-peso', answer: 70 },
    { questionId: 'q-anticoagulante', answer: true },
  ];
  const doneResult = {
    interactionId: 'interaction-002',
    output: { reasoning: 'test', recommendations: [], uncertainty: false, uncertaintyReason: null },
    citations: [],
    metadata: { turnIndex: 1, maxTurns: 5 },
  };

  let respondStream: ReturnType<typeof vi.fn>;
  let controller: CopilotController;

  beforeEach(() => {
    respondStream = vi.fn();
    controller = new CopilotController(
      { respondStream } as unknown as CopilotService,
      { submit: vi.fn() } as unknown as CopilotFeedbackService,
    );
  });

  /** O pipe que a rota de fato usa na query — o mesmo que o Nest aplica. */
  function queryPipe(): PipeTransform {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, CopilotController, 'respondStream') as
      | Record<string, { pipes?: unknown[] }>
      | undefined;
    const pipe = Object.values(args ?? {})
      .flatMap((arg) => arg.pipes ?? [])
      .find((candidate) => candidate instanceof ZodValidationPipe);
    if (!pipe) throw new Error('respondStream sem ZodValidationPipe na query');
    return pipe as PipeTransform;
  }

  function parse(query: Record<string, unknown>) {
    return queryPipe().transform(query, { type: 'query' });
  }

  function rejection(query: Record<string, unknown>): BadRequestException {
    try {
      parse(query);
    } catch (error) {
      if (error instanceof BadRequestException) return error;
      throw error;
    }
    throw new Error('a query foi aceita');
  }

  describe('query', () => {
    it('parses the JSON answers with the POST respondSchema', () => {
      expect(parse({ interactionId, answers: JSON.stringify(answers) })).toEqual({
        interactionId,
        answers,
      });
    });

    it('returns 400 for answers that are not valid JSON', () => {
      const error = rejection({ interactionId, answers: '[{"questionId":' });

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        errors: [{ field: 'answers', message: 'answers must be valid JSON' }],
      });
    });

    it.each([
      ['an empty list', { interactionId, answers: '[]' }],
      ['an answer without questionId', { interactionId, answers: '[{"answer":"sim"}]' }],
      ['an object instead of a list', { interactionId, answers: '{"q1":"sim"}' }],
      [
        'an answer of another type',
        { interactionId, answers: '[{"questionId":"q1","answer":null}]' },
      ],
      [
        'an interactionId that is not a UUID',
        { interactionId: 'abc', answers: JSON.stringify(answers) },
      ],
      ['no answers at all', { interactionId }],
    ])('returns 400 for %s, as the POST would', (_label, query) => {
      expect(rejection(query).getStatus()).toBe(400);
    });

    it('returns 400 above the URL-length ceiling, even for valid JSON', () => {
      const long = JSON.stringify([
        { questionId: 'q1', answer: 'a'.repeat(MAX_RESPOND_STREAM_ANSWERS_LENGTH) },
      ]);

      expect(rejection({ interactionId, answers: long }).getStatus()).toBe(400);
    });
  });

  describe('SSE', () => {
    it('forwards the parsed answers to the service and emits its events like the initial stream', async () => {
      const understanding = understandingFixture();
      async function* events() {
        yield { type: 'understanding' as const, understanding };
        yield { type: 'delta' as const, delta: '{' };
        yield { type: 'done' as const, result: doneResult };
      }
      respondStream.mockReturnValue(events());
      const query = parse({ interactionId, answers: JSON.stringify(answers) });

      const observable = controller.respondStream(req, encounterId, query as never);
      // Observable frio: o gerador só é criado na inscrição.
      expect(respondStream).not.toHaveBeenCalled();
      const emitted = await lastValueFrom(observable.pipe(toArray()));

      expect(respondStream).toHaveBeenCalledWith('phys-001', encounterId, {
        interactionId,
        answers,
      });
      expect(emitted.map((event) => event.data)).toEqual([
        { type: 'understanding', understanding },
        { type: 'delta', delta: '{' },
        { type: 'done', result: doneResult },
      ]);
    });

    it('completes after the error event of a failed validation', async () => {
      async function* events() {
        yield { type: 'delta' as const, delta: 'não é JSON' };
        yield { type: 'error' as const, errors: ['Output is not valid JSON'] };
      }
      respondStream.mockReturnValue(events());

      const emitted = await lastValueFrom(
        controller.respondStream(req, encounterId, { interactionId, answers }).pipe(toArray()),
      );

      expect(emitted.at(-1)?.data).toEqual({ type: 'error', errors: ['Output is not valid JSON'] });
    });

    it('errors the Observable when the service refuses before the first event', async () => {
      // eslint-disable-next-line require-yield -- recusa antes de qualquer evento
      async function* refused(): AsyncGenerator<never> {
        throw new BadRequestException('Input contains potentially unsafe content');
      }
      respondStream.mockReturnValue(refused());

      await expect(
        lastValueFrom(controller.respondStream(req, encounterId, { interactionId, answers })),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
