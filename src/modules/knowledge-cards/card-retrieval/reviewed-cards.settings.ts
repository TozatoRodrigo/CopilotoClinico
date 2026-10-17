import type { ConfigService } from '@nestjs/config';

/**
 * CC-408 — limiares da relevância dos cartões, lidos a cada busca para
 * recalibrar sem redeploy. Valor ausente, vazio, não numérico ou fora da
 * faixa cai no padrão: um typo nunca afrouxa o portão em silêncio.
 *
 * O padrão da similaridade é provisório: mais alto que o piso das diretrizes
 * (0,30), porque o cartão libera dose. Calibrar com `pnpm eval:card-retrieval`
 * no provedor escolhido (CC-406) e, de vez, com o portão da CC-407.
 */
export const DEFAULT_REVIEWED_CARDS_MIN_SIMILARITY = 0.5;
/** Cartões por análise: cada um é um bloco no prompt da decisão. */
export const DEFAULT_REVIEWED_CARDS_MAX = 3;
/** Vizinhos lidos do índice por consulta, antes do portão. */
export const REVIEWED_CARD_CANDIDATES_PER_QUERY = 8;

export interface ReviewedCardsSettings {
  minSimilarity: number;
  maxCards: number;
}

function readNumber(
  config: ConfigService,
  key: string,
  fallback: number,
  isValid: (value: number) => boolean,
): number {
  const raw = config.get<string | number | undefined>(key);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && isValid(parsed) ? parsed : fallback;
}

export function readReviewedCardsSettings(config: ConfigService): ReviewedCardsSettings {
  return {
    minSimilarity: readNumber(
      config,
      'REVIEWED_CARDS_MIN_SIMILARITY',
      DEFAULT_REVIEWED_CARDS_MIN_SIMILARITY,
      (value) => value > 0 && value <= 1,
    ),
    maxCards: readNumber(
      config,
      'REVIEWED_CARDS_MAX',
      DEFAULT_REVIEWED_CARDS_MAX,
      (value) => Number.isInteger(value) && value >= 1 && value <= 5,
    ),
  };
}
