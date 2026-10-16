import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  countDetectionsByType,
  maskPII,
  type PIIFilterResult,
  type PIIType,
} from '../copilot/guardrails/pii-filter';
import { maskModelEntities } from '../copilot/guardrails/model-entities';
import { currentRequestContext } from '../../shared/request-context/request-context';
import {
  DEID_MODEL_CLIENT,
  DeidModelError,
  type DeidFallbackReason,
  type DeidModelClient,
} from './deid-model.client';
import { deidTimeoutFor, readDeidMode, type DeidMode } from './deid.settings';

/** Onde o texto entrou: vai para o log, para ver qual etapa cai na regex. */
export type DeidStage = 'case' | 'answer' | 'attachment' | 'transcription' | 'consult';

export interface DeidResult {
  /** O único texto que segue adiante: para o modelo de IA e para o banco. */
  redacted: string;
  hasPII: boolean;
  /** Quantos trechos de cada tipo saíram (regex + modelo). Nunca o trecho. */
  counts: Partial<Record<PIIType, number>>;
  /** O que de fato rodou: com o serviço fora, `regex` mesmo com DEID_MODE=model. */
  mode: DeidMode;
  fallback: DeidFallbackReason | null;
}

export interface Deidentifier {
  deidentify(text: string, stage: DeidStage): Promise<DeidResult>;
}

function fromRegex(pii: PIIFilterResult, fallback: DeidFallbackReason | null): DeidResult {
  return {
    redacted: pii.redacted,
    hasPII: pii.hasPII,
    counts: countDetectionsByType(pii.detections),
    mode: 'regex',
    fallback,
  };
}

/**
 * Só a regex, sem serviço: o padrão de quem constrói os serviços à mão (testes,
 * scripts). No Nest o DeidentificationService é obrigatório.
 */
export const REGEX_ONLY_DEIDENTIFIER: Deidentifier = {
  deidentify: (text) => Promise.resolve(fromRegex(maskPII(text), null)),
};

/**
 * CC-203 / ADR-020 — de-identificação de todo texto clínico antes de chamada
 * de IA e de gravação: regex (CPF, telefone, prontuário, nome depois de
 * tratamento) → modelo local (nome solto, parente, endereço) → epônimos
 * protegidos (CC-202) tirados dos trechos do modelo.
 *
 * O modelo nunca derruba a análise: serviço fora, lento (> DEID_TIMEOUT_MS) ou
 * com resposta estranha, o texto segue só com a regex e o log ganha um
 * `DEID_FALLBACK`. Log só com etapa, tamanho, contagem e latência.
 */
@Injectable()
export class DeidentificationService implements Deidentifier {
  private readonly logger = new Logger('Deid');

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DEID_MODEL_CLIENT) private readonly client: DeidModelClient,
  ) {}

  async deidentify(text: string, stage: DeidStage): Promise<DeidResult> {
    const regex = maskPII(text);
    if (readDeidMode(this.config) !== 'model' || regex.redacted.trim() === '') {
      return fromRegex(regex, null);
    }

    const startedAt = Date.now();
    const requestId = currentRequestContext()?.requestId ?? '-';
    try {
      const entities = await this.client.findEntities(
        regex.redacted,
        deidTimeoutFor(this.config, regex.redacted.length),
      );
      const model = maskModelEntities(regex.redacted, entities);
      const counts = countDetectionsByType(regex.detections);
      for (const type of model.maskedTypes) counts[type] = (counts[type] ?? 0) + 1;
      // entities x masked: o modelo marcou, a proteção de epônimo e a junção
      // de vizinhos deixaram. Diferença grande demais é sinal para revisar.
      this.logger.log(
        `DEID stage=${stage} mode=model latencyMs=${Date.now() - startedAt} chars=${text.length} ` +
          `regex=${regex.detections.length} entities=${entities.length} ` +
          `masked=${model.maskedTypes.length} requestId=${requestId}`,
      );
      return {
        redacted: model.redacted,
        hasPII: regex.hasPII || model.maskedTypes.length > 0,
        counts,
        mode: 'model',
        fallback: null,
      };
    } catch (error) {
      const reason: DeidFallbackReason =
        error instanceof DeidModelError ? error.reason : 'bad_response';
      this.logger.warn(
        `DEID_FALLBACK stage=${stage} reason=${reason} latencyMs=${Date.now() - startedAt} ` +
          `chars=${text.length} requestId=${requestId}`,
      );
      return fromRegex(regex, reason);
    }
  }
}
