import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { MODEL_ENTITY_LABELS, type ModelEntity } from '../copilot/guardrails/model-entities';
import { readDeidServiceUrl } from './deid.settings';

/** Por que o texto seguiu só com a regex. Vai para o log; nunca o texto. */
export type DeidFallbackReason = 'timeout' | 'unavailable' | 'bad_status' | 'bad_response';

export class DeidModelError extends Error {
  constructor(
    readonly reason: DeidFallbackReason,
    readonly status?: number,
  ) {
    super(`deid model ${reason}${status === undefined ? '' : ` (HTTP ${status})`}`);
    this.name = 'DeidModelError';
  }
}

/** Quem acha nome, endereço e documento no texto (o serviço copiloto-deid, ou um fake nos testes). */
export interface DeidModelClient {
  findEntities(text: string, timeoutMs: number): Promise<ModelEntity[]>;
}

export const DEID_MODEL_CLIENT = Symbol('DEID_MODEL_CLIENT');

/** Contrato de services/deid/app.py (POST /v1/entities). Rótulo novo é resposta inválida. */
const EntitiesResponseSchema = z.object({
  entities: z.array(
    z.object({
      label: z.enum(MODEL_ENTITY_LABELS),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      score: z.number(),
    }),
  ),
});

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

@Injectable()
export class HttpDeidModelClient implements DeidModelClient {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async findEntities(text: string, timeoutMs: number): Promise<ModelEntity[]> {
    // Um sinal só para a ida e a leitura da resposta: o teto vale para tudo.
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${readDeidServiceUrl(this.config)}/v1/entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });
    } catch (error) {
      throw new DeidModelError(isTimeout(error) ? 'timeout' : 'unavailable');
    }
    if (!response.ok) {
      // 503: carregando o modelo ou fila cheia — o serviço está lá, mas não agora.
      throw new DeidModelError(
        response.status === 503 ? 'unavailable' : 'bad_status',
        response.status,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new DeidModelError(isTimeout(error) ? 'timeout' : 'bad_response');
    }
    const parsed = EntitiesResponseSchema.safeParse(body);
    if (!parsed.success) throw new DeidModelError('bad_response');
    return parsed.data.entities;
  }
}
