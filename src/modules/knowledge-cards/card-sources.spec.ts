import { describe, expect, it } from 'vitest';
import {
  DIAGNOSIS_CHUNK_ID,
  DOCUMENT_ID,
  sourceChunk,
  sourceChunks,
  TREATMENT_CHUNK_ID,
  TREATMENT_TEXT,
  validCardInput,
} from '../../../tests/fixtures/knowledge-cards';
import {
  prepareCardContent,
  requestedChunkIds,
  sourceChunkProblem,
  toCardSource,
} from './card-sources';
import { hashCardContent } from './domain/card-content';
import { chunkTextSha256 } from './domain/draft-provenance';

const INSTITUTION_A = '44444444-4444-4444-8444-444444444444';
const INSTITUTION_B = '55555555-5555-4555-8555-555555555555';

describe('sourceChunkProblem', () => {
  it('aceita trecho curado ou oficial vigente', () => {
    for (const status of ['approved', 'official_unreviewed'] as const) {
      expect(
        sourceChunkProblem(sourceChunk({ status }), { institutionId: null, alreadyCited: false }),
      ).toBeNull();
    }
  });

  it('recusa trecho pendente, rejeitado, substituído ou desativado como fonte nova', () => {
    for (const status of ['pending_review', 'rejected', 'superseded'] as const) {
      expect(
        sourceChunkProblem(sourceChunk({ status }), { institutionId: null, alreadyCited: false }),
      ).toMatch(/não pode ser fonte nova/);
    }
    expect(
      sourceChunkProblem(sourceChunk({ validTo: new Date() }), {
        institutionId: null,
        alreadyCited: false,
      }),
    ).toMatch(/desativado/);
  });

  it('deixa a correção manter o trecho que já era fonte, mesmo substituído', () => {
    expect(
      sourceChunkProblem(sourceChunk({ status: 'superseded' }), {
        institutionId: null,
        alreadyCited: true,
      }),
    ).toBeNull();
  });

  it('trata trecho de outra instituição como inexistente (ADR-009)', () => {
    const institutional = sourceChunk({ institutionId: INSTITUTION_B });
    expect(sourceChunkProblem(institutional, { institutionId: null, alreadyCited: false })).toBe(
      'trecho de diretriz não encontrado',
    );
    expect(
      sourceChunkProblem(institutional, { institutionId: INSTITUTION_A, alreadyCited: true }),
    ).toBe('trecho de diretriz não encontrado');
    expect(
      sourceChunkProblem(institutional, { institutionId: INSTITUTION_B, alreadyCited: false }),
    ).toBeNull();
  });

  it('cartão institucional pode citar diretriz global', () => {
    expect(
      sourceChunkProblem(sourceChunk(), { institutionId: INSTITUTION_A, alreadyCited: false }),
    ).toBeNull();
  });
});

describe('toCardSource', () => {
  it('resolve os metadados do chunk e fixa o hash do texto', () => {
    expect(toCardSource('S1', sourceChunk())).toEqual({
      key: 'S1',
      chunkId: TREATMENT_CHUNK_ID,
      documentId: DOCUMENT_ID,
      title: 'PCDT · Meningite bacteriana',
      sourceVersion: '2024-05',
      section: '7. TRATAMENTO',
      url: 'https://www.gov.br/conitec/pcdt-meningite.pdf',
      chunkSha256: chunkTextSha256(TREATMENT_TEXT),
    });
  });

  it('lê `fonte_url` do seed da base curada e descarta URL inválida', () => {
    expect(
      toCardSource('S1', sourceChunk({ metadata: { fonte_url: 'https://www.ahajournals.org/x' } }))
        .url,
    ).toBe('https://www.ahajournals.org/x');
    expect(toCardSource('S1', sourceChunk({ metadata: { url: 'não é url' } })).url).toBeNull();
    expect(toCardSource('S1', sourceChunk({ metadata: null })).section).toBeNull();
  });
});

describe('requestedChunkIds', () => {
  it('extrai só ids de chunk com forma de UUID', () => {
    expect(
      requestedChunkIds({
        sources: [{ chunkId: TREATMENT_CHUNK_ID }, { chunkId: 'x' }, null, { key: 'S3' }],
      }),
    ).toEqual([TREATMENT_CHUNK_ID]);
    expect(requestedChunkIds('texto')).toEqual([]);
    expect(requestedChunkIds({ sources: 'S1' })).toEqual([]);
  });
});

describe('prepareCardContent', () => {
  it('resolve as fontes e devolve o conteúdo com o hash assinável', () => {
    const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.content.sources.map((source) => source.chunkId)).toEqual([
      TREATMENT_CHUNK_ID,
      DIAGNOSIS_CHUNK_ID,
    ]);
    expect(prepared.content.sources[1]?.section).toBe('6. DIAGNÓSTICO');
    expect(prepared.contentSha256).toBe(hashCardContent(prepared.content));
  });

  it('devolve os problemas de formato com o caminho', () => {
    const prepared = prepareCardContent(
      { ...validCardInput(), question: 'Dose?', answerCitations: [] },
      sourceChunks(),
      { institutionId: null },
    );

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.issues.map((issue) => issue.path)).toEqual(['question', 'answerCitations']);
  });

  it('recusa chave de fonte repetida', () => {
    const content = validCardInput();
    content.sources = [
      { key: 'S1', chunkId: TREATMENT_CHUNK_ID },
      { key: 'S1', chunkId: DIAGNOSIS_CHUNK_ID },
    ];
    const prepared = prepareCardContent(content, sourceChunks(), { institutionId: null });

    expect(prepared).toEqual({
      ok: false,
      issues: [{ path: 'sources', message: 'chave repetida' }],
    });
  });

  it('recusa fonte inelegível antes de conferir citação', () => {
    const chunks = sourceChunks();
    chunks.set(TREATMENT_CHUNK_ID, sourceChunk({ status: 'pending_review' }));

    const prepared = prepareCardContent(validCardInput(), chunks, { institutionId: null });

    expect(prepared).toEqual({
      ok: false,
      issues: [
        {
          path: 'sources[0].chunkId',
          message: 'trecho de diretriz pending_review não pode ser fonte nova',
        },
      ],
    });
  });

  it('recusa o conteúdo com citação que não está na fonte', () => {
    const content = validCardInput();
    content.answerCitations = [
      { sourceKey: 'S1', quote: 'Ceftriaxona 2 g IV de 12 em 12 horas no adulto' },
    ];

    const prepared = prepareCardContent(content, sourceChunks(), { institutionId: null });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.issues[0]?.path).toBe('answerCitations[0].quote');
  });
});
