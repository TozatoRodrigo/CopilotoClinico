import { describe, expect, it } from 'vitest';
import {
  CROSS_REVIEW_SAMPLE_PERCENT,
  crossReviewBucket,
  crossReviewerProblem,
  crossReviewRates,
  isSampledForCrossReview,
  median,
} from './cross-review';

/** UUIDs v4 determinísticos para o teste estatístico (não precisam ser aleatórios, só variados). */
function uuidFromIndex(index: number): string {
  const hex = index.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-0000-4000-8000-${hex}`;
}

describe('amostragem da revisão cruzada (CC-411)', () => {
  it('é determinística: a mesma versão cai sempre no mesmo balde', () => {
    const versionId = '99999999-9999-4999-8999-999999999999';

    expect(crossReviewBucket(versionId)).toBe(crossReviewBucket(versionId));
    expect(crossReviewBucket(versionId)).toBeGreaterThanOrEqual(0);
    expect(crossReviewBucket(versionId)).toBeLessThan(100);
  });

  it('bate com o SQL do runbook (4 primeiros bytes do SHA-256 de "cc-411:<id>" módulo 100)', () => {
    // sha256("cc-411:<id>") começa por 0x695129ab e 0x5519cfdb; conferido em
    // Postgres com a consulta do runbook.
    expect(crossReviewBucket('00000000-0000-4000-8000-000000000000')).toBe(0x695129ab % 100);
    expect(crossReviewBucket('99999999-9999-4999-8999-999999999999')).toBe(0x5519cfdb % 100);
    expect(crossReviewBucket('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBe(1);
  });

  it('sorteia perto de 10% das aprovações', () => {
    const total = 20_000;
    let sampled = 0;
    for (let index = 0; index < total; index += 1) {
      if (isSampledForCrossReview(crossReviewBucket(uuidFromIndex(index)))) sampled += 1;
    }

    expect(CROSS_REVIEW_SAMPLE_PERCENT).toBe(10);
    expect(sampled / total).toBeGreaterThan(0.09);
    expect(sampled / total).toBeLessThan(0.11);
  });

  it('entra na amostra quem fica abaixo da porcentagem', () => {
    expect(isSampledForCrossReview(0)).toBe(true);
    expect(isSampledForCrossReview(9)).toBe(true);
    expect(isSampledForCrossReview(10)).toBe(false);
    expect(isSampledForCrossReview(99)).toBe(false);
  });
});

describe('segundo médico', () => {
  const task = { firstReviewerId: 'primeiro', versionAuthorId: 'autor' };

  it('não pode ser quem aprovou', () => {
    expect(crossReviewerProblem('primeiro', task)).toMatch(/você aprovou/);
  });

  it('não pode ser quem escreveu a versão', () => {
    expect(crossReviewerProblem('autor', task)).toMatch(/você escreveu/);
  });

  it('qualquer outro médico pode', () => {
    expect(crossReviewerProblem('segundo', task)).toBeNull();
    expect(crossReviewerProblem('segundo', { ...task, versionAuthorId: null })).toBeNull();
  });
});

describe('taxas', () => {
  it('concordância e divergência sobre as revisões cruzadas feitas', () => {
    expect(crossReviewRates({ agreed: 19, diverged: 1 })).toEqual({
      agreementRate: 0.95,
      divergenceRate: 0.05,
    });
  });

  it('sem revisão cruzada feita, sem taxa', () => {
    expect(crossReviewRates({ agreed: 0, diverged: 0 })).toEqual({
      agreementRate: null,
      divergenceRate: null,
    });
  });

  it('mediana do tempo de revisão', () => {
    expect(median([])).toBeNull();
    expect(median([300_000, 60_000, 120_000])).toBe(120_000);
    expect(median([60_000, 120_000, 180_000, 600_000])).toBe(150_000);
  });
});
