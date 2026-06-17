import {
  AIProvider,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
} from './provider.interface';
import type { ProviderOverrides } from './anthropic.provider';

/**
 * Deterministic, offline AI provider for E2E/integration tests (F4).
 *
 * Selected via `AI_PROVIDER=test`. Returns canned, schema-valid copilot output
 * so the full pipeline (orchestrator → validateOutput → documents → confirm)
 * runs deterministically without an LLM key or network. Behavior is steered by a
 * sentinel in the case text:
 *   - `[uncertain]`  → emits a blocker clarifying question + uncertainty (turn 0)
 *   - any subsequent turn (detectable via the QA block added by continueAnalysis)
 *     or no sentinel → emits a definitive conduta that closes the loop.
 *
 * Embeddings return a fixed 1536-dim unit vector (matches `vector(1536)`).
 */
export class DeterministicProvider implements AIProvider {
  readonly name = 'test';

  constructor(
    private readonly _config?: unknown,
    private readonly _overrides?: ProviderOverrides,
  ) {}

  private static readonly EMBEDDING_DIM = 1536;
  private static readonly UNCERTAIN_SENTINEL = '[uncertain]';
  private static readonly RESPOND_MARKER = 'Informações adicionais fornecidas pelo médico';

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const userText = params.messages.find((m) => m.role === 'user')?.content ?? '';
    const content = DeterministicProvider.buildOutput(userText);
    const tokens = Math.ceil(content.length / 4);
    return {
      content,
      model: params.model,
      usage: { promptTokens: tokens, completionTokens: tokens, totalTokens: tokens * 2 },
      latencyMs: 1,
    };
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string> {
    const userText = params.messages.find((m) => m.role === 'user')?.content ?? '';
    yield DeterministicProvider.buildOutput(userText);
  }

  async embed(params: EmbeddingParams): Promise<EmbeddingResponse> {
    // Fixed unit vector along axis 0 — deterministic, non-zero norm.
    const base = new Array<number>(DeterministicProvider.EMBEDDING_DIM).fill(0);
    base[0] = 1;
    const embeddings = params.texts.map(() => base);
    const tokens = params.texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
    return {
      embeddings,
      model: params.model,
      usage: { promptTokens: tokens, totalTokens: tokens },
    };
  }

  private static buildOutput(userText: string): string {
    const isRespond = userText.includes(DeterministicProvider.RESPOND_MARKER);
    const wantsUncertain =
      userText.includes(DeterministicProvider.UNCERTAIN_SENTINEL) && !isRespond;

    if (wantsUncertain) {
      return JSON.stringify({
        reasoning:
          'Caso com dados insuficientes para uma conduta definitiva — uma informação bloqueadora é necessária.',
        redFlags: [],
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'É necessário confirmar um dado bloqueador antes de definir a conduta.',
        differentials: [],
        clarifyingQuestions: [
          {
            id: 'det-blocker-1',
            question: 'O paciente apresenta o fator de risco bloqueador? (determinístico)',
            why: 'A resposta muda a conduta — usado apenas para o fluxo de teste E2E.',
            criticality: 'blocker',
            expectedAnswerType: 'boolean',
          },
        ],
      });
    }

    return JSON.stringify({
      reasoning:
        'Conduta definitiva sugerida com base nas informações disponíveis (saída determinística de teste).',
      redFlags: [],
      recommendations: [
        {
          action: 'Iniciar tratamento sintomático de apoio (saída determinística de teste)',
          rationale:
            'Recomendação estável para validar o fluxo de geração e confirmação de documento.',
          citationChunkId: 'det-chunk-1',
          confidence: 0.82,
          preliminary: false,
          category: 'therapeutic',
        },
      ],
      uncertainty: false,
      uncertaintyReason: null,
      differentials: [],
      clarifyingQuestions: [],
    });
  }
}
