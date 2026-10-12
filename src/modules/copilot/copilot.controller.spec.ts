import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import Fastify, { type FastifyInstance } from 'fastify';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CopilotFeedbackService } from './feedback/copilot-feedback.service';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { lastValueFrom, toArray } from 'rxjs';
import { understandingFixture } from '../../../tests/fixtures/case-understanding';

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

// Reanálise por streaming: POST com o mesmo corpo e a mesma validação do POST
// /respond, e a resposta em text/event-stream — nenhum texto clínico na URL
// (ADR-014).
describe('CopilotController — respond/stream', () => {
  const req = { user: { physicianId: 'phys-001' } };
  const encounterId = 'enc-001';
  const interactionId = '11111111-1111-4111-8111-111111111111';
  const answers = [
    { questionId: 'q-glicemia', answer: '112' },
    { questionId: 'q-peso', answer: 70 },
    { questionId: 'q-anticoagulante', answer: true },
  ];
  const body = { interactionId, answers };
  const doneResult = {
    interactionId: 'interaction-002',
    output: { reasoning: 'test', recommendations: [], uncertainty: false, uncertaintyReason: null },
    citations: [],
    metadata: { turnIndex: 1, maxTurns: 5 },
  };

  let respondStream: ReturnType<typeof vi.fn>;
  let controller: CopilotController;
  let app: FastifyInstance;

  beforeEach(async () => {
    respondStream = vi.fn();
    controller = new CopilotController(
      { respondStream } as unknown as CopilotService,
      { submit: vi.fn() } as unknown as CopilotFeedbackService,
    );
    // Fastify de verdade: a resposta crua (cabeçalhos, corpo em stream) é a
    // parte que importa desta rota.
    app = Fastify();
    app.post('/stream', (request, reply) =>
      controller.respondStream(req, encounterId, request.body as typeof body, reply),
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  /** O pipe que a rota de fato usa no corpo — o mesmo que o Nest aplica. */
  function bodyPipe(): PipeTransform {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, CopilotController, 'respondStream') as
      | Record<string, { pipes?: unknown[] }>
      | undefined;
    const pipe = Object.values(args ?? {})
      .flatMap((arg) => arg.pipes ?? [])
      .find((candidate) => candidate instanceof ZodValidationPipe);
    if (!pipe) throw new Error('respondStream sem ZodValidationPipe no corpo');
    return pipe as PipeTransform;
  }

  function rejection(candidate: Record<string, unknown>): BadRequestException {
    try {
      bodyPipe().transform(candidate, { type: 'body' });
    } catch (error) {
      if (error instanceof BadRequestException) return error;
      throw error;
    }
    throw new Error('o corpo foi aceito');
  }

  describe('corpo', () => {
    it('accepts the same body as POST /respond, with no size ceiling', () => {
      const long = { interactionId, answers: [{ questionId: 'q1', answer: 'a'.repeat(20_000) }] };

      expect(bodyPipe().transform(body, { type: 'body' })).toEqual(body);
      expect(bodyPipe().transform(long, { type: 'body' })).toEqual(long);
    });

    it.each([
      ['an empty list', { interactionId, answers: [] }],
      ['an answer without questionId', { interactionId, answers: [{ answer: 'sim' }] }],
      [
        'an answer of another type',
        { interactionId, answers: [{ questionId: 'q1', answer: null }] },
      ],
      ['an interactionId that is not a UUID', { interactionId: 'abc', answers }],
      ['no answers at all', { interactionId }],
    ])('returns 400 for %s, as the POST would', (_label, candidate) => {
      expect(rejection(candidate).getStatus()).toBe(400);
    });
  });

  describe('resposta', () => {
    it('forwards the body to the service and streams its events as text/event-stream', async () => {
      const understanding = understandingFixture();
      async function* events() {
        yield { type: 'understanding' as const, understanding };
        yield { type: 'delta' as const, delta: '{' };
        yield { type: 'done' as const, result: doneResult };
      }
      respondStream.mockResolvedValue(events());

      const res = await app.inject({ method: 'POST', url: '/stream', payload: body });

      expect(respondStream).toHaveBeenCalledWith('phys-001', encounterId, body);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.payload).toBe(
        ': stream aberto\n\n' +
          `data: ${JSON.stringify({ type: 'understanding', understanding })}\n\n` +
          `data: ${JSON.stringify({ type: 'delta', delta: '{' })}\n\n` +
          `data: ${JSON.stringify({ type: 'done', result: doneResult })}\n\n`,
      );
    });

    it('ends after the error event of a failed validation', async () => {
      async function* events() {
        yield { type: 'delta' as const, delta: 'não é JSON' };
        yield { type: 'error' as const, errors: ['Output is not valid JSON'] };
      }
      respondStream.mockResolvedValue(events());

      const res = await app.inject({ method: 'POST', url: '/stream', payload: body });

      expect(res.payload.trimEnd().split('\n\n').at(-1)).toBe(
        `data: ${JSON.stringify({ type: 'error', errors: ['Output is not valid JSON'] })}`,
      );
    });

    it('turns a failure after opening into an error event, without the internal message', async () => {
      async function* events() {
        yield { type: 'delta' as const, delta: '{' };
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      }
      respondStream.mockResolvedValue(events());

      const res = await app.inject({ method: 'POST', url: '/stream', payload: body });

      expect(res.statusCode).toBe(200);
      expect(res.payload).not.toContain('ECONNREFUSED');
      expect(res.payload.trimEnd().split('\n\n').at(-1)).toBe(
        `data: ${JSON.stringify({ type: 'error', errors: ['Internal server error'] })}`,
      );
    });

    it('lets a refusal before opening reach the exception filter, before any byte', async () => {
      const reply = { send: vi.fn(), code: vi.fn(), header: vi.fn() };
      respondStream.mockRejectedValue(
        new BadRequestException('Input contains potentially unsafe content'),
      );

      await expect(
        controller.respondStream(req, encounterId, body, reply as never),
      ).rejects.toThrow(BadRequestException);
      expect(reply.send).not.toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalled();
    });
  });
});
