/**
 * CC-06 — Golden cases: "o médico nunca fica sem próximo passo".
 *
 * ORIGEM: reunião de validação com Dr. João Paulo Ripardo e Dr. Gustavo
 * Moreira. Ao apresentar um caso de cefaleia com descrição pobre, o sistema
 * devolveu:
 *
 *   "Plano sugerido — 0 definitivas · 0 preliminares
 *    Não há evidência recuperada suficiente para orientar a avaliação de
 *    cefaleia inespecífica nem dados clínicos para determinar se há TCE,
 *    hemorragia intracerebral ou instabilidade que permitam aplicar os
 *    trechos disponíveis."
 *
 * O modelo já sabia exatamente o que perguntar — TCE, hemorragia,
 * instabilidade — mas despejou isso em prosa morta em vez de perguntas
 * acionáveis. A causa raiz eram QUATRO travas independentes empilhadas na
 * mesma porta (ver docs internos da Sprint 26 / CC-01 a CC-04):
 *
 *   1. Diretriz de cefaleia ausente da base semeada        (CC-01, fora deste arquivo)
 *   2. Validador exigia "uncertainty" quando recs=0         (CC-02)
 *   3. DECISION RULE de 3 caminhos não previa o quadrante   (CC-03)
 *      "sem evidência E sem dado do paciente"
 *   4. Toda pergunta exigia citação de diretriz              (CC-04)
 *
 * ══════════════════════════════════════════════════════════════════════
 *  INVARIANTE DE PRODUTO — NÃO REMOVER NEM FLEXIBILIZAR ESTA ASSERÇÃO.
 *  Ela é a expressão executável da correção inteira da Sprint 26: o
 *  médico nunca recebe um output que não recomenda nada E não pergunta
 *  nada. Se um ajuste futuro de prompt ou de validador quebrar isto,
 *  quebrou a Sprint 26 inteira, mesmo que pareça um detalhe cosmético.
 * ══════════════════════════════════════════════════════════════════════
 *
 * DOIS MODOS DE EXECUÇÃO:
 *  - MOCKADO (padrão, roda sempre em CI): usa fixtures de resposta do
 *    modelo — determinístico, testa a lógica de validação/retry/orquestração,
 *    não testa se o modelo REAL vai obedecer ao prompt.
 *  - AO VIVO (sob flag COPILOT_GOLDEN_LIVE=1, nunca em CI): chamaria o
 *    modelo real. Não implementado neste ambiente por não haver credenciais
 *    de provedor de IA disponíveis nesta sessão — os hooks (`describe.skipIf`)
 *    estão preparados para quem for rodar manualmente com credenciais reais;
 *    ver o bloco "LIVE MODE" ao final do arquivo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestratorService } from '../../src/modules/copilot/orchestrator/orchestrator.service';
import { PrismaService } from '../../src/config/prisma.service';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import { EncountersService } from '../../src/modules/encounters/encounters.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { validateOutput } from '../../src/modules/copilot/guardrails/output-validator';

/**
 * A asserção central de todo este arquivo. Aplicada a cada golden case,
 * presente e futuro. Ver o aviso no cabeçalho do arquivo.
 */
function assertNeverDeadEnd(output: {
  recommendations: unknown[];
  clarifyingQuestions: unknown[];
}): void {
  expect(
    output.recommendations.length + output.clarifyingQuestions.length,
    'DEAD END: o output não recomendou nada E não perguntou nada — isto é ' +
      'exatamente a parede reproduzida na apresentação. Ver cabeçalho deste arquivo.',
  ).toBeGreaterThan(0);
}

describe('CC-06: Golden cases — copilot never leaves the physician at a dead end', () => {
  let service: OrchestratorService;
  let prismaMock: {
    aiInteraction: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    physician: { findUnique: ReturnType<typeof vi.fn> };
  };
  let aiGatewayMock: {
    complete: ReturnType<typeof vi.fn>;
    completeStream: ReturnType<typeof vi.fn>;
    getProviderName: ReturnType<typeof vi.fn>;
  };
  let retrievalMock: { search: ReturnType<typeof vi.fn> };
  let encountersMock: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let auditMock: { log: ReturnType<typeof vi.fn> };
  let configMock: { get: ReturnType<typeof vi.fn> };

  const physicianId = 'phys-golden';
  const encounterId = 'enc-golden';

  const highGravityChunks = [
    {
      id: 'chunk-shock-1',
      text: 'Approach to Shock: avaliar PAM, sinais periféricos, lactato seriado.',
      source: 'UpToDate — Approach to Shock',
      sourceVersion: '2024',
      specialty: 'emergencia',
      evidenceLevel: 'A',
      institutionId: null,
      score: 0.95,
      metadata: {},
    },
  ];

  function completionOf(content: Record<string, unknown>, model = 'test-model') {
    return {
      content: JSON.stringify(content),
      model,
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      latencyMs: 900,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      aiInteraction: { create: vi.fn(), findFirst: vi.fn() },
      // PI-05 — mesmo motivo do orchestrator.service.spec.ts: null reproduz
      // o comportamento pt-BR padrão anterior à PI-05.
      physician: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    aiGatewayMock = {
      complete: vi.fn(),
      completeStream: vi.fn(),
      getProviderName: vi.fn().mockReturnValue('test-provider'),
    };
    retrievalMock = { search: vi.fn() };
    encountersMock = { findById: vi.fn(), update: vi.fn().mockResolvedValue({}) };
    auditMock = { log: vi.fn().mockResolvedValue({ id: 'audit-golden' }) };
    configMock = { get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue) };

    service = new OrchestratorService(
      prismaMock as unknown as PrismaService,
      aiGatewayMock as unknown as AiGatewayService,
      retrievalMock as unknown as RetrievalService,
      encountersMock as unknown as EncountersService,
      auditMock as unknown as AuditService,
      configMock as unknown as ConfigService,
    );

    encountersMock.findById.mockResolvedValue({
      id: encounterId,
      physicianId,
      patientRef: 'PRN-GOLDEN',
      institutionId: null,
      context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-01 — O CASO DA APRESENTAÇÃO (crítico)
  // ────────────────────────────────────────────────────────────────────
  describe('GC-01: the presentation case — poor headache description', () => {
    const poorCaseText = 'Paciente com cefaleia.';

    it('recovers via the automatic retry when the model first attempts the OLD wall shape', async () => {
      // Retrieval fraco por texto vago — reproduz exatamente o cenário real:
      // sem diretriz de cefaleia na base, o retrieval não acha nada.
      retrievalMock.search.mockResolvedValue({ chunks: [], totalRetrieved: 0 });

      // Primeira tentativa do modelo: a PAREDE antiga (uncertainty sozinho,
      // sem recomendação e sem pergunta) — o comportamento pré-Sprint-26.
      const wallAttempt = completionOf({
        reasoning:
          'Não há evidência recuperada suficiente para orientar a avaliação de cefaleia inespecífica.',
        redFlags: [],
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Base de diretrizes não cobre cefaleia inespecífica.',
        differentials: [],
        clarifyingQuestions: [],
      });

      // Segunda tentativa (retry automático, com o erro DEAD END injetado
      // como feedback): o modelo agora pergunta, seguindo o caminho D.
      const retryAttempt = completionOf({
        reasoning: 'Sem diretriz específica recuperada; solicitando dados para triagem.',
        redFlags: [],
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Base de diretrizes não cobre cefaleia inespecífica.',
        differentials: [],
        clarifyingQuestions: [
          {
            id: 'q-onset',
            question: 'A cefaleia foi súbita (em trovoada) ou progressiva?',
            why: 'Cefaleia em trovoada obriga excluir hemorragia subaracnoide de imediato',
            criticality: 'blocker',
            expectedAnswerType: 'choice',
            choices: ['Súbita', 'Progressiva'],
          },
          {
            id: 'q-focal-deficit',
            question: 'Há déficit neurológico focal, febre ou rigidez de nuca?',
            why: 'Determina prioridade de neuroimagem e investigação infecciosa',
            criticality: 'blocker',
            expectedAnswerType: 'boolean',
          },
        ],
      });

      aiGatewayMock.complete
        .mockResolvedValueOnce(wallAttempt)
        .mockResolvedValueOnce(retryAttempt);
      prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-01' });

      const result = await service.analyze(physicianId, encounterId, {
        caseText: poorCaseText,
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
        redFlags: {},
      });

      // Prova de que o retry de fato aconteceu (2 chamadas ao gateway).
      expect(aiGatewayMock.complete).toHaveBeenCalledTimes(2);

      // O resultado final NUNCA é a parede.
      assertNeverDeadEnd(result.output);
      expect(result.output.clarifyingQuestions.length).toBeGreaterThan(0);
      expect(result.output.recommendations).toEqual([]);
    });

    it('accepts the compliant path-D shape on the first attempt without needing a retry', async () => {
      retrievalMock.search.mockResolvedValue({ chunks: [], totalRetrieved: 0 });

      aiGatewayMock.complete.mockResolvedValueOnce(
        completionOf({
          reasoning: 'Caso vago; priorizando triagem de red flags de cefaleia.',
          redFlags: [],
          recommendations: [],
          uncertainty: true,
          uncertaintyReason: 'Base de diretrizes não cobre cefaleia inespecífica.',
          differentials: [],
          clarifyingQuestions: [
            {
              id: 'q-onset',
              question: 'A cefaleia foi súbita ou progressiva?',
              why: 'Discrimina causa vascular aguda de causa subaguda',
              criticality: 'blocker',
              expectedAnswerType: 'choice',
              choices: ['Súbita', 'Progressiva'],
            },
          ],
        }),
      );
      prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-01b' });

      const result = await service.analyze(physicianId, encounterId, {
        caseText: poorCaseText,
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
        redFlags: {},
      });

      expect(aiGatewayMock.complete).toHaveBeenCalledTimes(1);
      assertNeverDeadEnd(result.output);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-02 / GC-05 — Vago sem cobertura na base / retrieval vazio
  // ────────────────────────────────────────────────────────────────────
  it('GC-02/GC-05: zero retrieved chunks always routes the prompt through DECISION MATRIX path D', async () => {
    retrievalMock.search.mockResolvedValue({ chunks: [], totalRetrieved: 0 });
    aiGatewayMock.complete.mockResolvedValueOnce(
      completionOf({
        reasoning: 'Sem evidência recuperada.',
        redFlags: [],
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Nenhum protocolo cobre este cenário na base atual.',
        differentials: [],
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'Qual o tempo de evolução dos sintomas?',
            why: 'Tempo de evolução muda a prioridade de investigação',
            criticality: 'blocker',
            expectedAnswerType: 'text',
          },
        ],
      }),
    );
    prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-02' });

    const result = await service.analyze(physicianId, encounterId, {
      caseText: 'Paciente mal caracterizado, poucos detalhes.',
      context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      redFlags: {},
    });

    // O PROMPT ENVIADO ao modelo — não só o resultado mockado — precisa
    // conter a instrução do caminho D (prova de que buildPrompt() e
    // buildCaseOnlyUser() foram de fato exercitados com zero chunks).
    const sentPrompt = aiGatewayMock.complete.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = sentPrompt.messages.find((m) => m.role === 'user')!;
    expect(userMessage.content).toContain('DECISION MATRIX path D');
    expect(userMessage.content).not.toContain('declare evidence insufficiency');

    assertNeverDeadEnd(result.output);
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-03 — Vago COM cobertura (o comportamento "preceptor" já maduro)
  // ────────────────────────────────────────────────────────────────────
  it('GC-03: vague case WITH guideline coverage yields preliminary recommendations plus guideline-anchored questions', async () => {
    retrievalMock.search.mockResolvedValue({ chunks: highGravityChunks, totalRetrieved: 1 });
    aiGatewayMock.complete.mockResolvedValueOnce(
      completionOf({
        reasoning: 'Quadro sugestivo de choque; dados hemodinâmicos incompletos.',
        redFlags: [
          { finding: 'Hipotensão relatada', severity: 'critical', action: 'Reposição volêmica imediata' },
        ],
        recommendations: [
          // NOTA: com uma clarifyingQuestion "blocker" presente, o refine
          // pré-existente do validador (independente da Sprint 26 — ver
          // output-validator.ts, regra "hasBlocker") exige que TODA
          // recomendação seja preliminary=true, mesmo a de estabilização.
          // "preliminary" aqui significa "pode ser refinada quando a
          // pergunta for respondida", não "não execute agora" — a ação de
          // estabilização continua sendo a primeira da lista (PRECEPTOR DE
          // EMERGÊNCIA RULE), só marcada como sujeita a ajuste.
          {
            action: 'Iniciar cristaloide EV em bolus',
            rationale: 'Suspeita de choque — estabilização não pode esperar',
            citationChunkId: 'chunk-shock-1',
            confidence: 0.9,
            preliminary: true,
            category: 'stabilization',
          },
          {
            action: 'Investigar etiologia obstrutiva vs. hemorrágica',
            rationale: 'Pendente de dados adicionais para definir etiologia',
            citationChunkId: 'chunk-shock-1',
            confidence: 0.6,
            preliminary: true,
            category: 'diagnostic',
          },
        ],
        uncertainty: false,
        uncertaintyReason: null,
        differentials: [],
        clarifyingQuestions: [
          {
            id: 'q-pam',
            question: 'Qual a PAM atual?',
            why: 'Define gravidade do choque — UpToDate Approach to Shock',
            criticality: 'blocker',
            expectedAnswerType: 'number',
          },
        ],
      }),
    );
    prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-03' });

    const result = await service.analyze(physicianId, encounterId, {
      caseText: 'Paciente hipotenso, choque a esclarecer.',
      context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      redFlags: {},
    });

    assertNeverDeadEnd(result.output);
    // Estabilização continua sendo a recomendação de maior prioridade
    // (PRECEPTOR DE EMERGÊNCIA RULE), mesmo marcada preliminary por causa
    // da blocker question em aberto.
    expect(result.output.recommendations[0]?.category).toBe('stabilization');
    expect(result.output.recommendations.every((r) => r.preliminary)).toBe(true);
    expect(result.output.clarifyingQuestions).toHaveLength(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-04 — Completo com cobertura (NÃO-REGRESSÃO do caminho A)
  // ────────────────────────────────────────────────────────────────────
  it('GC-04: complete case with coverage still yields definitive recommendations and zero questions (path A untouched)', async () => {
    retrievalMock.search.mockResolvedValue({ chunks: highGravityChunks, totalRetrieved: 1 });
    aiGatewayMock.complete.mockResolvedValueOnce(
      completionOf({
        reasoning: 'Caso completo, choque hipovolêmico caracterizado.',
        redFlags: [],
        recommendations: [
          {
            action: 'Reposição volêmica guiada por PAM',
            rationale: 'Choque hipovolêmico confirmado',
            citationChunkId: 'chunk-shock-1',
            confidence: 0.95,
            preliminary: false,
            category: 'stabilization',
          },
        ],
        uncertainty: false,
        uncertaintyReason: null,
        differentials: [],
        clarifyingQuestions: [],
      }),
    );
    prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-04' });

    const result = await service.analyze(physicianId, encounterId, {
      caseText:
        'Paciente 45a, PA 80/50, FC 130, extremidades frias, hemorragia digestiva ativa confirmada há 30min.',
      context: { hasCT: false, isSus: false, hasLab: true, hasICU: true },
      redFlags: {},
    });

    assertNeverDeadEnd(result.output);
    expect(result.output.clarifyingQuestions).toEqual([]);
    expect(result.output.recommendations.every((r) => !r.preliminary)).toBe(true);
    expect(result.output.uncertainty).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-06 — Convergência do loop (entrada pobre → pergunta → resposta → definitivo)
  // ────────────────────────────────────────────────────────────────────
  it('GC-06: the decision loop converges — definitive recommendations only grow across turns, never regress to a dead end', async () => {
    retrievalMock.search.mockResolvedValue({ chunks: highGravityChunks, totalRetrieved: 1 });

    // Turno 0: vago, mas com cobertura — pergunta, sem recomendação definitiva.
    aiGatewayMock.complete.mockResolvedValueOnce(
      completionOf({
        reasoning: 'Suspeita de choque, dado hemodinâmico pendente.',
        redFlags: [],
        recommendations: [],
        uncertainty: false,
        uncertaintyReason: null,
        differentials: [],
        clarifyingQuestions: [
          {
            id: 'q-pa',
            question: 'Qual a pressão arterial atual?',
            why: 'Define o índice de choque — UpToDate Approach to Shock',
            criticality: 'blocker',
            expectedAnswerType: 'text',
          },
        ],
      }),
    );
    prismaMock.aiInteraction.create.mockResolvedValueOnce({ id: 'interaction-golden-06-t0' });

    const turn0 = await service.analyze(physicianId, encounterId, {
      caseText: 'Paciente taquicárdico, hipotensão a confirmar.',
      context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      redFlags: {},
    });
    assertNeverDeadEnd(turn0.output);
    expect(turn0.output.recommendations).toHaveLength(0);

    // Turno 1 (continueAnalysis): respondida a PA, agora definitivo.
    prismaMock.aiInteraction.findFirst.mockResolvedValueOnce({
      id: 'interaction-golden-06-t0',
      encounterId,
      turnIndex: 0,
      inputRedacted: 'Paciente taquicárdico, hipotensão a confirmar.',
      answeredQuestions: null,
      params: { demoCase: null, redFlags: {} },
      rawOutput: turn0.output,
    });
    aiGatewayMock.complete.mockResolvedValueOnce(
      completionOf({
        reasoning: 'PA confirmada em choque — conduta definitiva.',
        redFlags: [
          { finding: 'PA 78/44', severity: 'critical', action: 'Reposição volêmica imediata' },
        ],
        recommendations: [
          {
            action: 'Reposição volêmica em bolus + monitorização contínua',
            rationale: 'Choque confirmado por PA e FC',
            citationChunkId: 'chunk-shock-1',
            confidence: 0.92,
            preliminary: false,
            category: 'stabilization',
          },
        ],
        uncertainty: false,
        uncertaintyReason: null,
        differentials: [],
        clarifyingQuestions: [],
      }),
    );
    prismaMock.aiInteraction.create.mockResolvedValueOnce({ id: 'interaction-golden-06-t1' });

    const turn1 = await service.continueAnalysis(physicianId, encounterId, {
      interactionId: 'interaction-golden-06-t0',
      answers: [{ questionId: 'q-pa', answer: '78/44' }],
    });

    assertNeverDeadEnd(turn1.output);
    // Convergência: 0 recomendações definitivas → 1 recomendação definitiva.
    // Nunca deveria "regredir" para um estado com menos informação acionável.
    expect(turn1.output.recommendations.filter((r) => !r.preliminary).length).toBeGreaterThanOrEqual(
      turn0.output.recommendations.filter((r) => !r.preliminary).length,
    );
    expect(turn1.output.clarifyingQuestions).toEqual([]);
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-07 — Turno final (forceFinal): a interação de maior risco da sprint
  // ────────────────────────────────────────────────────────────────────
  describe('GC-07: last allowed turn (forceFinal) never produces a dead end', () => {
    it('accepts a compliant final turn with preliminary recommendations and zero questions', async () => {
      configMock.get.mockImplementation((key: string, defaultValue?: unknown) =>
        key === 'COPILOT_MAX_TURNS' ? 5 : defaultValue,
      );
      retrievalMock.search.mockResolvedValue({ chunks: highGravityChunks, totalRetrieved: 1 });
      prismaMock.aiInteraction.findFirst.mockResolvedValue({
        id: 'interaction-golden-07-parent',
        encounterId,
        turnIndex: 3, // newTurnIndex = 4 = maxTurns - 1 → forceFinal
        inputRedacted: 'Caso em investigação há vários turnos.',
        answeredQuestions: null,
        params: { demoCase: null, redFlags: {} },
        rawOutput: {
          reasoning: 'Turno anterior',
          recommendations: [],
          uncertainty: false,
          uncertaintyReason: null,
          clarifyingQuestions: [
            { id: 'qX', question: 'Pergunta pendente', why: 'x', criticality: 'blocker', expectedAnswerType: 'boolean' },
          ],
        },
      });
      aiGatewayMock.complete.mockResolvedValueOnce(
        completionOf({
          reasoning: 'Último turno — recomendação com base no que se sabe até agora.',
          redFlags: [],
          recommendations: [
            {
              action: 'Conduta conservadora com reavaliação em 2h',
              rationale: 'Melhor evidência disponível dado o limite de turnos',
              citationChunkId: 'chunk-shock-1',
              confidence: 0.55,
              preliminary: true,
              category: 'therapeutic',
            },
          ],
          uncertainty: true,
          uncertaintyReason: 'Ainda há lacunas de informação não resolvidas até o limite de turnos.',
          differentials: [],
          clarifyingQuestions: [],
        }),
      );
      prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-07-final' });

      const result = await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-golden-07-parent',
        answers: [{ questionId: 'qX', answer: 'sim' }],
      });

      const sentPrompt = aiGatewayMock.complete.mock.calls[0]![0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const userMessage = sentPrompt.messages.find((m) => m.role === 'user')!;
      expect(userMessage.content).toContain('"recommendations" NÃO PODE ficar vazio');

      assertNeverDeadEnd(result.output);
      expect(result.output.clarifyingQuestions).toEqual([]);
    });

    it('rejects a non-compliant final turn that still attempts zero recommendations and zero questions', () => {
      // Verificação direta do validador: mesmo isolando o cenário de
      // forceFinal (sem passar pelo orquestrador), um output que ignore a
      // instrução e devolva a parede continua sendo rejeitado — a rede de
      // segurança do CC-02 não depende do texto da instrução ser obedecido.
      const result = validateOutput(
        JSON.stringify({
          reasoning: 'Não obedeceu a instrução de turno final.',
          redFlags: [],
          recommendations: [],
          uncertainty: true,
          uncertaintyReason: 'Ainda incerto.',
          differentials: [],
          clarifyingQuestions: [],
        }),
        ['chunk-shock-1'],
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('DEAD END'))).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // GC-08 — Red flags preservadas entre turnos (cobre CC-05)
  // ────────────────────────────────────────────────────────────────────
  it('GC-08: a red flag confirmed by the physician survives into a follow-up turn prompt', async () => {
    retrievalMock.search.mockResolvedValue({ chunks: highGravityChunks, totalRetrieved: 1 });
    prismaMock.aiInteraction.findFirst.mockResolvedValueOnce({
      id: 'interaction-golden-08-parent',
      encounterId,
      turnIndex: 0,
      inputRedacted: 'Paciente gestante com dor abdominal.',
      answeredQuestions: null,
      params: { demoCase: null, redFlags: { pregnant: true } },
      rawOutput: {
        reasoning: 'Turno inicial',
        recommendations: [],
        uncertainty: false,
        uncertaintyReason: null,
        clarifyingQuestions: [
          { id: 'q1', question: 'Início súbito?', why: 'x', criticality: 'blocker', expectedAnswerType: 'boolean' },
        ],
      },
    });
    aiGatewayMock.complete.mockResolvedValueOnce(
      completionOf({
        reasoning: 'Considerando gestação confirmada.',
        redFlags: [],
        recommendations: [
          {
            action: 'Avaliação obstétrica de urgência',
            rationale: 'Dor abdominal em gestante',
            citationChunkId: 'chunk-shock-1',
            confidence: 0.8,
            preliminary: false,
            category: 'diagnostic',
          },
        ],
        uncertainty: false,
        uncertaintyReason: null,
        differentials: [],
        clarifyingQuestions: [],
      }),
    );
    prismaMock.aiInteraction.create.mockResolvedValue({ id: 'interaction-golden-08-t1' });

    const result = await service.continueAnalysis(physicianId, encounterId, {
      interactionId: 'interaction-golden-08-parent',
      answers: [{ questionId: 'q1', answer: 'Sim' }],
    });

    const sentPrompt = aiGatewayMock.complete.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = sentPrompt.messages.find((m) => m.role === 'user')!;
    expect(userMessage.content).toContain('physician_confirmed_red_flags');
    expect(userMessage.content).toContain('Paciente gestante ou amamentando');

    assertNeverDeadEnd(result.output);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 * LIVE MODE (não implementado nesta sessão)
 * ══════════════════════════════════════════════════════════════════════
 * Este bloco documenta o formato esperado para quem for habilitar o modo
 * "ao vivo" com credenciais reais de provedor de IA. Não foi implementado
 * porque este ambiente de desenvolvimento não tem credenciais configuradas
 * e chamar um provedor pago de forma autônoma exigiria autorização
 * explícita fora do escopo desta tarefa.
 *
 * Esqueleto sugerido:
 *
 *   const LIVE = process.env.COPILOT_GOLDEN_LIVE === '1';
 *   describe.skipIf(!LIVE)('GC live mode', () => {
 *     it('GC-01 live: real model asks instead of walling on the presentation case', async () => {
 *       // instanciar o módulo Nest completo (ou um AiGatewayService real),
 *       // rodar o texto literal do caso da apresentação, e aplicar
 *       // assertNeverDeadEnd() ao resultado de verdade.
 *     });
 *   });
 *
 * Rodar com: COPILOT_GOLDEN_LIVE=1 npx vitest run tests/integration/copilot-golden-cases.spec.ts
 */
