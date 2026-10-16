import { createHash } from 'node:crypto';

/**
 * CC-411 (ADR-019, adendo) — revisão cruzada: uma amostra das aprovações é
 * revista por um segundo médico, para pegar o erro de dose que um revisor
 * sozinho deixa passar.
 */

/** Porcentagem das aprovações sorteadas (CC-411: 10%). */
export const CROSS_REVIEW_SAMPLE_PERCENT = 10;

/** Métrica de sucesso do CC-411: divergência abaixo de 5%. */
export const CROSS_REVIEW_DIVERGENCE_TARGET = 0.05;

/**
 * Prefixo do hash: o mesmo id em outra amostragem futura cai em outro balde,
 * e o sorteio fica reproduzível em SQL (ver runbook).
 */
const SAMPLE_SALT = 'cc-411';

/**
 * Balde de 0 a 99 de uma versão aprovada: os 4 primeiros bytes do SHA-256 de
 * `cc-411:<id>` módulo 100. Determinístico e auditável — ninguém escolhe o que
 * cai na amostra, e o id da versão existe antes da aprovação, então quem
 * aprova não influencia o sorteio pelo momento em que decide.
 */
export function crossReviewBucket(versionId: string): number {
  const digest = createHash('sha256').update(`${SAMPLE_SALT}:${versionId}`, 'utf8').digest();
  return digest.readUInt32BE(0) % 100;
}

export function isSampledForCrossReview(bucket: number): boolean {
  return bucket < CROSS_REVIEW_SAMPLE_PERCENT;
}

/**
 * Por que este médico não pode fazer a revisão cruzada, ou `null` se pode. O
 * segundo médico não é quem aprovou nem quem escreveu a versão (a correção de
 * um médico aprovada por outro já teve dois olhares; o terceiro é outro).
 */
export function crossReviewerProblem(
  reviewerId: string,
  task: { firstReviewerId: string; versionAuthorId: string | null },
): string | null {
  if (reviewerId === task.firstReviewerId) {
    return 'A revisão cruzada é de outro médico: você aprovou esta versão';
  }
  if (reviewerId === task.versionAuthorId) {
    return 'A revisão cruzada é de outro médico: você escreveu esta versão';
  }
  return null;
}

export interface CrossReviewRates {
  /** Concordâncias sobre as revisões cruzadas feitas; `null` sem nenhuma feita. */
  agreementRate: number | null;
  divergenceRate: number | null;
}

export function crossReviewRates(counts: { agreed: number; diverged: number }): CrossReviewRates {
  const done = counts.agreed + counts.diverged;
  if (done === 0) return { agreementRate: null, divergenceRate: null };
  return { agreementRate: counts.agreed / done, divergenceRate: counts.diverged / done };
}

/** Mediana (média dos dois do meio quando a quantidade é par); `null` sem valores. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}
