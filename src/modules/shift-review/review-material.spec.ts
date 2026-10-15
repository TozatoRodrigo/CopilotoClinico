import { describe, expect, it } from 'vitest';
import {
  analysisRow,
  headacheAnalysis,
  PATIENT_CPF,
  PATIENT_REF,
  sepsisAnalysis,
} from '../../../tests/fixtures/shift-review';
import { buildReviewMaterial, latestValidAnalyses } from './review-material';
import { MAX_REVIEW_ANALYSES } from './shift-review.settings';

describe('buildReviewMaterial', () => {
  it('lists the understanding, the conducts and the cited sources of each analysis', () => {
    const headache = analysisRow();
    const sepsis = analysisRow({
      rawOutput: sepsisAnalysis(),
      createdAt: new Date('2026-10-13T12:00:00Z'),
    });

    const material = buildReviewMaterial([headache, sepsis]);

    expect(material.analyses.map(({ key, syndrome }) => [key, syndrome])).toEqual([
      ['A1', 'cefaleia'],
      ['A2', 'febre-hipotensao'],
    ]);
    const [first] = material.analyses;
    expect(first?.cannotMiss).toEqual(['Hemorragia subaracnóidea']);
    expect(first?.redFlags).toEqual([
      { finding: 'Pior cefaleia da vida', action: 'TC de crânio imediata' },
    ]);
    expect(first?.recommendations.map(({ sourceKey }) => sourceKey)).toEqual(['F1', null]);
    expect(material.sources.get('F1')).toMatchObject({
      analysisKey: 'A1',
      interactionId: headache.interactionId,
      encounterId: headache.encounterId,
      syndrome: 'cefaleia',
      stored: {
        kind: 'analysis_citation',
        chunkId: 'chunk-hsa-1',
        title: 'Diretriz de cefaleia na emergência',
        version: '2024',
        origin: 'official_unreviewed',
        url: 'https://example.org/cefaleia.pdf',
      },
    });
    expect(material.sources.get('F2')?.analysisKey).toBe('A2');
  });

  it('masks PII and the patientRef in everything the model reads', () => {
    const material = buildReviewMaterial([analysisRow()]);

    const serialized = JSON.stringify(material.analyses);
    expect(serialized).not.toContain(PATIENT_CPF);
    expect(serialized).not.toContain(PATIENT_REF);
    expect(serialized).toContain('[REDACTED_CPF]');
    expect(serialized).toContain('[PATIENT_REF_REDACTED]');
    expect(material.patientRefs).toEqual([PATIENT_REF]);
  });

  it('never offers model knowledge or a physician attachment as a source', () => {
    const material = buildReviewMaterial([analysisRow({ rawOutput: sepsisAnalysis() })]);

    expect([...material.sources.values()].map(({ stored }) => stored.title)).toEqual([
      'Protocolo de sepse',
    ]);
    expect(JSON.stringify(material)).not.toContain('anexo.pdf');
  });

  it('leaves out an analysis without a citable source', () => {
    const output = headacheAnalysis();
    const recommendations = output.recommendations as Array<Record<string, unknown>>;
    const material = buildReviewMaterial([
      analysisRow({ rawOutput: { ...output, recommendations: recommendations.slice(1) } }),
    ]);

    expect(material.analyses).toEqual([]);
    expect(material.sources.size).toBe(0);
  });

  it('uses the latest valid analysis of each case and skips validation failures', () => {
    const encounterId = '20000000-0000-4000-8000-000000000001';
    const older = analysisRow({ encounterId, createdAt: new Date('2026-10-13T10:00:00Z') });
    const newer = analysisRow({
      encounterId,
      createdAt: new Date('2026-10-13T11:00:00Z'),
      rawOutput: sepsisAnalysis(),
    });
    const failed = analysisRow({
      encounterId,
      createdAt: new Date('2026-10-13T12:00:00Z'),
      rawOutput: { raw: '{', validationErrors: ['Output is not valid JSON'] },
    });

    const latest = latestValidAnalyses([older, failed, newer]);

    expect(latest.map(({ row }) => row.interactionId)).toEqual([newer.interactionId]);
  });

  it('reads an analysis without understanding (decision v1)', () => {
    const output = headacheAnalysis();
    const material = buildReviewMaterial([
      analysisRow({
        rawOutput: {
          ...output,
          understanding: undefined,
          differentials: [{ hypothesis: 'Enxaqueca', whyConsider: 'x', whatDistinguishes: 'y' }],
        },
      }),
    ]);

    expect(material.analyses[0]).toMatchObject({
      syndrome: null,
      problemRepresentation: null,
      likely: ['Enxaqueca'],
    });
  });

  it(`stops at ${MAX_REVIEW_ANALYSES} cases`, () => {
    const rows = Array.from({ length: MAX_REVIEW_ANALYSES + 2 }, () => analysisRow());

    expect(buildReviewMaterial(rows).analyses).toHaveLength(MAX_REVIEW_ANALYSES);
  });

  it('adds the reviewed cards an analysis used as citable sources (CC-402 extension point)', () => {
    const row = analysisRow();

    const material = buildReviewMaterial(
      [row],
      [
        {
          interactionId: row.interactionId,
          cardId: '30000000-0000-4000-8000-000000000001',
          versionId: '30000000-0000-4000-8000-000000000002',
          title: 'Cefaleia em trovoada',
          excerpt: 'TC sem contraste é o exame inicial.',
        },
        {
          interactionId: 'outra-analise',
          cardId: '30000000-0000-4000-8000-000000000003',
          versionId: '30000000-0000-4000-8000-000000000004',
          title: 'Não usado',
          excerpt: 'Não usado.',
        },
      ],
    );

    expect([...material.sources.values()].map(({ key, stored }) => [key, stored.kind])).toEqual([
      ['F1', 'analysis_citation'],
      ['F2', 'knowledge_card'],
    ]);
  });
});
