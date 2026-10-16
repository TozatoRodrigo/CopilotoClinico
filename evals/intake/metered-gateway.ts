import { AsyncLocalStorage } from 'node:async_hooks';
import { AiRefusalError, AiTruncatedError } from '../../src/modules/ai-gateway/ai-gateway.errors';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type {
  CompletionResponse,
  CompletionUsage,
} from '../../src/modules/ai-gateway/providers/provider.interface';
import { calculateInferenceCost } from '../../src/modules/copilot/orchestrator/model-pricing';
import { costUsd } from '../clinical/pricing';
import { classifyProviderError, errorTypeOf, type ProviderFailure, type SpendGuard } from './guard';
import type { CallRecord } from './records';

/** Só o que a leitura do caso usa do gateway: o AiGatewayService real, ou um falso nos testes. */
export type CompletionGateway = Pick<AiGatewayService, 'complete'>;

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

const DETAIL_CHARS = 300;

function usageOf(error: unknown): { model: string; usage: CompletionUsage } | null {
  if (error instanceof AiRefusalError || error instanceof AiTruncatedError) {
    return { model: error.details.model, usage: error.details.usage };
  }
  return null;
}

/**
 * CC-104 — o gateway com taxímetro: confere o freio antes de cada chamada,
 * soma o gasto, para a rodada no limite de uso e anota cada chamada no caso
 * que a fez (AsyncLocalStorage segue o caso por dentro do UnderstandingService,
 * mesmo com casos em paralelo). Custo pela tabela de preços do pipeline
 * (model-pricing.ts), pelo modelo que de fato respondeu.
 */
export class MeteredGateway implements CompletionGateway {
  private readonly storage = new AsyncLocalStorage<CallRecord[]>();

  constructor(
    private readonly inner: CompletionGateway,
    private readonly guard: SpendGuard,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Roda `task` anotando em `sink` as chamadas que ela fizer. */
  track<Value>(sink: CallRecord[], task: () => Promise<Value>): Promise<Value> {
    return this.storage.run(sink, task);
  }

  async complete(
    params: Parameters<CompletionGateway['complete']>[0],
  ): Promise<CompletionResponse> {
    // Sem modelo, o gateway usa o AI_MODEL; a leitura sempre passa o AI_INTAKE_MODEL.
    const requestedModel = params.model ?? 'AI_MODEL';
    const startedAt = this.clock.now();
    try {
      this.guard.assertCanCall();
      const response = await this.inner.complete(params);
      this.record({
        requestedModel,
        servedModel: response.model,
        latencyMs: this.clock.now() - startedAt,
        usage: response.usage,
        costUsd: costUsd(response.model, response.usage),
        failure: null,
        errorType: null,
      });
      this.guard.addSpend(calculateInferenceCost({ model: response.model, usage: response.usage }));
      return response;
    } catch (error) {
      const failure: ProviderFailure = classifyProviderError(error);
      const spent = usageOf(error);
      this.record({
        requestedModel,
        servedModel: spent?.model ?? null,
        latencyMs: this.clock.now() - startedAt,
        usage: spent?.usage ?? null,
        costUsd: spent ? costUsd(spent.model, spent.usage) : 0,
        failure,
        errorType: failure === 'stopped' ? null : errorTypeOf(error),
      });
      if (spent) this.guard.addSpend(calculateInferenceCost(spent));
      if (failure === 'usage_limit') {
        const message = error instanceof Error ? error.message : String(error);
        this.guard.stop({
          kind: 'usage_limit',
          model: requestedModel,
          detail: message.slice(0, DETAIL_CHARS),
        });
      }
      throw error;
    }
  }

  private record(call: CallRecord): void {
    this.storage.getStore()?.push(call);
  }
}
