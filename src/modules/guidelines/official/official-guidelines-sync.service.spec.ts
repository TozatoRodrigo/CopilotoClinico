import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../config/prisma.service';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type { AuditService } from '../../audit/audit.service';
import {
  ListingIntegrityError,
  OfficialGuidelinesSyncService,
} from './official-guidelines-sync.service';
import type { OfficialSourceFetcher } from './official-source-fetcher';

vi.mock('../ingestion/document-text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ingestion/document-text')>()),
  readPdfText: vi.fn(async (data: Buffer) => ({
    text: PDF_TEXT_BY_CONTENT[data.toString()] ?? '',
    pages: 10,
  })),
}));

const DDT_LISTING = readFileSync(join(process.cwd(), 'tests/fixtures/conitec/ddt.html'), 'utf-8');
const STOMACH_KEY = 'ddt:adenocarcinoma-de-estomago';
const STOMACH_URL =
  'https://www.gov.br/conitec/pt-br/midias/relatorios/portaria/2018/portaria-conjunta-3_ddt-adenocarcinoma-de-estomago_15_01_2018_sctie.pdf/@@display-file/file';

const DDT_TEXT = [
  'ANEXO',
  '1 INTRODUÇÃO',
  'O adenocarcinoma gástrico é frequente.',
  '2 CLASSIFICAÇÃO ESTATÍSTICA INTERNACIONAL DE DOENÇAS',
  'C16.0 Cárdia',
  '3 DIAGNÓSTICO E ESTADIAMENTO',
  'Endoscopia digestiva alta com biópsia.',
  '4 OPÇÕES TERAPÊUTICAS',
  'Gastrectomia com linfadenectomia D2.',
  '5 REFERÊNCIAS',
  'Autor.',
].join('\n');

const PDF_TEXT_BY_CONTENT: Record<string, string> = { 'pdf-v2': DDT_TEXT, 'pdf-v1': DDT_TEXT };
const sha = (content: string) => createHash('sha256').update(Buffer.from(content)).digest('hex');

const CLASSIFICATION = JSON.stringify({
  careSetting: 'cronico',
  population: 'adulto',
  specialty: 'oncologia',
  cenarios: [],
  rationale: 'Tratamento oncológico eletivo.',
});

describe('OfficialGuidelinesSyncService', () => {
  let tx: {
    officialGuidelineDocument: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    guidelineChunk: { updateMany: ReturnType<typeof vi.fn> };
    $executeRaw: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    officialGuidelineDocument: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
  };
  let aiGateway: { complete: ReturnType<typeof vi.fn>; embed: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let fetcher: { fetchText: ReturnType<typeof vi.fn>; fetchPdf: ReturnType<typeof vi.fn> };
  let service: OfficialGuidelinesSyncService;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    tx = {
      officialGuidelineDocument: {
        create: vi.fn(async () => {
          calls.push('create');
          return { id: 'doc-new' };
        }),
        update: vi.fn(async ({ data }) => {
          calls.push(`update:${data.status}`);
          return {};
        }),
      },
      guidelineChunk: {
        updateMany: vi.fn(async ({ data }) => {
          calls.push(`chunks:${data.status}`);
          return { count: 3 };
        }),
      },
      $executeRaw: vi.fn(async () => {
        calls.push('insert-chunk');
        return 1;
      }),
    };
    prisma = {
      officialGuidelineDocument: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    aiGateway = {
      complete: vi.fn().mockResolvedValue({ content: CLASSIFICATION, model: 'model-x' }),
      embed: vi.fn(async (texts: string[]) => ({ embeddings: texts.map(() => [0.1, 0.2]) })),
    };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    fetcher = {
      fetchText: vi.fn().mockResolvedValue(DDT_LISTING),
      fetchPdf: vi.fn(async (url: string) => (url === STOMACH_URL ? Buffer.from('pdf-v2') : null)),
    };

    service = new OfficialGuidelinesSyncService(
      prisma as unknown as PrismaService,
      aiGateway as unknown as AiGatewayService,
      audit as unknown as AuditService,
      fetcher as unknown as OfficialSourceFetcher,
    );
  });

  const syncStomach = (options: { dryRun?: boolean; reclassify?: boolean } = {}) =>
    service.sync({ dryRun: false, kinds: ['ddt'], only: 'adenocarcinoma-de-estomago', ...options });

  it('aborta antes de qualquer escrita quando a lista vem abaixo do piso', async () => {
    fetcher.fetchText.mockResolvedValue('<table><tr><td>A</td></tr></table>');

    await expect(service.sync({ dryRun: false, kinds: ['ddt'] })).rejects.toBeInstanceOf(
      ListingIntegrityError,
    );
    expect(prisma.officialGuidelineDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ingere documento novo como official_unreviewed, só com seções clínicas', async () => {
    const report = await syncStomach();

    expect(report.documents).toEqual([
      expect.objectContaining({
        documentKey: STOMACH_KEY,
        outcome: 'new',
        sectioning: 'structured',
        chunks: 2,
        classification: { careSetting: 'cronico', source: 'llm', cenarios: [] },
      }),
    ]);
    expect(tx.officialGuidelineDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentKey: STOMACH_KEY,
        pdfSha256: sha('pdf-v2'),
        cid10: ['C16.0'],
        careSetting: 'cronico',
        specialty: 'oncologia',
        chunkCount: 2,
      }),
      select: { id: true },
    });

    const inserted = tx.$executeRaw.mock.calls.map((call) => call.slice(1));
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toContain(
      '[DDT · Adenocarcinoma de estômago · 3. DIAGNÓSTICO E ESTADIAMENTO]\nEndoscopia digestiva alta com biópsia.',
    );
    expect(inserted.flat().join(' ')).not.toContain('Autor.');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OFFICIAL_GUIDELINE_SYNCED' }),
    );
  });

  it('não faz nada quando o SHA-256 do PDF é o mesmo da versão ativa', async () => {
    prisma.officialGuidelineDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        documentKey: STOMACH_KEY,
        pdfSha256: sha('pdf-v2'),
        normativeAct: null,
        annexUpdatedAt: null,
      },
    ]);

    const report = await syncStomach();

    expect(report.documents[0]!.outcome).toBe('unchanged');
    expect(aiGateway.complete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('versão nova substitui a anterior na mesma transação, desativando antes de criar', async () => {
    prisma.officialGuidelineDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        documentKey: STOMACH_KEY,
        pdfSha256: sha('pdf-v1'),
        normativeAct: 'x',
        annexUpdatedAt: null,
      },
    ]);

    const report = await syncStomach();

    expect(report.documents[0]!.outcome).toBe('updated');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // O índice parcial só admite uma versão ativa: a antiga sai primeiro.
    expect(calls.slice(0, 3)).toEqual(['update:superseded', 'chunks:superseded', 'create']);
    expect(tx.guidelineChunk.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', status: 'official_unreviewed' },
      data: { status: 'superseded', validTo: expect.any(Date) },
    });
  });

  it('reativa uma versão já coletada em vez de duplicar', async () => {
    prisma.officialGuidelineDocument.findMany.mockResolvedValue([
      {
        id: 'doc-2',
        documentKey: STOMACH_KEY,
        pdfSha256: sha('pdf-v1'),
        normativeAct: 'x',
        annexUpdatedAt: null,
      },
    ]);
    prisma.officialGuidelineDocument.findUnique.mockResolvedValue({ id: 'doc-old' });

    const report = await syncStomach();

    expect(report.documents[0]!.outcome).toBe('reactivated');
    expect(calls).toEqual([
      'update:superseded',
      'chunks:superseded',
      'update:active',
      'chunks:official_unreviewed',
    ]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('dry-run não classifica com LLM, não gera embedding e não grava', async () => {
    const report = await syncStomach({ dryRun: true });

    expect(report.documents[0]).toMatchObject({ outcome: 'new', chunks: 2 });
    expect(report.documents[0]!.classification!.source).toBe('heuristic');
    expect(aiGateway.complete).not.toHaveBeenCalled();
    expect(aiGateway.embed).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('usa a heurística quando a LLM falha, sem perder o documento', async () => {
    aiGateway.complete.mockRejectedValue(new Error('timeout'));

    const report = await syncStomach();

    expect(report.documents[0]).toMatchObject({ outcome: 'new' });
    expect(report.documents[0]!.classification!.source).toBe('heuristic');
  });

  it('reporta link que não é PDF e erro de um documento sem parar os demais', async () => {
    fetcher.fetchPdf.mockImplementation(async (url: string) => {
      if (url === STOMACH_URL) throw new Error('HTTP 503');
      return null;
    });

    const report = await service.sync({ dryRun: false, kinds: ['ddt'], limit: 3 });

    expect(report.documents.map((doc) => doc.outcome)).toEqual(['error', 'not_pdf', 'not_pdf']);
    expect(report.documents[0]!.detail).toBe('HTTP 503');
  });

  it('reporta documento ativo que sumiu da lista, sem removê-lo', async () => {
    prisma.officialGuidelineDocument.findMany.mockResolvedValue([
      {
        id: 'doc-x',
        documentKey: 'ddt:revogado',
        pdfSha256: 'x',
        normativeAct: null,
        annexUpdatedAt: null,
      },
    ]);

    const report = await syncStomach({ dryRun: true });

    expect(report.missingFromListing).toEqual(['ddt:revogado']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('--reclassify atualiza só a classificação de documento sem mudança', async () => {
    prisma.officialGuidelineDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        documentKey: STOMACH_KEY,
        pdfSha256: sha('pdf-v2'),
        normativeAct: null,
        annexUpdatedAt: null,
      },
    ]);

    const report = await syncStomach({ reclassify: true });

    expect(report.documents[0]!.outcome).toBe('reclassified');
    expect(prisma.officialGuidelineDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-1' } }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
