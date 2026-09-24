import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GuidelineChunkStatus,
  OfficialDocumentStatus,
  type OfficialGuidelineDocument,
  type OfficialGuidelineKind,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AuditService } from '../../audit/audit.service';
import { normalizePdfText, readPdfText } from '../ingestion/document-text';
import { parseConitecListing } from './conitec-listing';
import {
  buildClassificationMessages,
  heuristicClassification,
  parseClassification,
} from './official-classification';
import {
  buildOfficialChunks,
  officialSource,
  officialSourceVersion,
  type OfficialChunk,
} from './official-chunks';
import { sectionDocument } from './official-document-sections';
import {
  CONITEC_LISTINGS,
  type ConitecListingItem,
  type ConitecListingSource,
  type DocumentClassification,
  type SectionedDocument,
} from './official-guideline.types';
import { OFFICIAL_SOURCE_FETCHER, type OfficialSourceFetcher } from './official-source-fetcher';

/**
 * ADR-010 — Sincroniza a base oficial da Conitec com `official_guideline_documents`.
 *
 * 1. Lê as quatro listas. Se alguma vier abaixo do piso, aborta ANTES de
 *    qualquer escrita: HTML mudou, não 100 protocolos foram revogados.
 * 2. Baixa cada PDF e compara o SHA-256 com a versão ativa. A Conitec altera
 *    anexo sem nova portaria, então portaria igual não prova versão igual.
 * 3. Versão nova: recorta seções clínicas, classifica, gera chunks e troca a
 *    versão ativa numa transação só — nunca há janela sem o documento.
 *
 * Erro num documento não para a execução; vai para o relatório.
 */

export interface SyncOptions {
  /** Baixa, compara e recorta, mas não classifica nem grava. */
  dryRun: boolean;
  kinds?: OfficialGuidelineKind[];
  /** Filtra por trecho de `documentKey` (ex.: "asma"). */
  only?: string;
  limit?: number;
  /** Refaz a classificação dos documentos sem mudança. */
  reclassify?: boolean;
}

export type DocumentOutcome =
  | 'new'
  | 'updated'
  | 'reactivated'
  | 'unchanged'
  | 'reclassified'
  | 'not_pdf'
  | 'error';

export interface DocumentReport {
  documentKey: string;
  title: string;
  outcome: DocumentOutcome;
  detail?: string;
  sectioning?: SectionedDocument['sectioning'];
  /** Fração do texto do PDF que virou chunk (0–1). */
  includedShare?: number;
  chunks?: number;
  classification?: Pick<DocumentClassification, 'careSetting' | 'source' | 'cenarios'>;
}

export interface SyncReport {
  dryRun: boolean;
  listed: Record<OfficialGuidelineKind, number>;
  documents: DocumentReport[];
  /** Ativos no banco que sumiram da lista. Só reportados, nunca removidos. */
  missingFromListing: string[];
}

export class ListingIntegrityError extends Error {}

/**
 * Teto contra recorte descontrolado. O maior documento legítimo (Diretriz de
 * Assistência ao Parto Normal, 509 páginas) gera ~660 chunks.
 */
const MAX_CHUNKS_PER_DOCUMENT = 1000;
const EMBEDDING_BATCH = 64;
const HTML_PAGE_PATTERN = /\.html?(?:[?#].*)?$/i;
const TRANSACTION_TIMEOUT_MS = 120_000;

type ActiveDocument = Pick<
  OfficialGuidelineDocument,
  'id' | 'documentKey' | 'pdfSha256' | 'normativeAct' | 'annexUpdatedAt'
>;

@Injectable()
export class OfficialGuidelinesSyncService {
  private readonly logger = new Logger(OfficialGuidelinesSyncService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(OFFICIAL_SOURCE_FETCHER) private readonly fetcher: OfficialSourceFetcher,
  ) {}

  async sync(options: SyncOptions): Promise<SyncReport> {
    const sources = CONITEC_LISTINGS.filter(
      (source) => !options.kinds || options.kinds.includes(source.kind),
    );
    const listings = await this.readListings(sources);

    const allItems = listings.flatMap((listing) => listing.items);
    const selected = allItems
      .filter((item) => !options.only || item.documentKey.includes(options.only))
      .slice(0, options.limit);

    const active = await this.prisma.officialGuidelineDocument.findMany({
      where: {
        status: OfficialDocumentStatus.active,
        kind: { in: sources.map((source) => source.kind) },
      },
      select: {
        id: true,
        documentKey: true,
        pdfSha256: true,
        normativeAct: true,
        annexUpdatedAt: true,
      },
    });
    const activeByKey = new Map(active.map((doc) => [doc.documentKey, doc]));
    const labelByKind = new Map(sources.map((source) => [source.kind, source.label]));

    const documents: DocumentReport[] = [];
    for (const [index, item] of selected.entries()) {
      this.logger.log(`[${index + 1}/${selected.length}] ${item.documentKey}`);
      documents.push(
        await this.syncDocument(
          item,
          labelByKind.get(item.kind)!,
          activeByKey.get(item.documentKey),
          options,
        ),
      );
    }

    const listedKeys = new Set(allItems.map((item) => item.documentKey));
    const report: SyncReport = {
      dryRun: options.dryRun,
      listed: Object.fromEntries(
        listings.map((listing) => [listing.source.kind, listing.items.length]),
      ) as SyncReport['listed'],
      documents,
      missingFromListing: active
        .filter((doc) => !listedKeys.has(doc.documentKey))
        .map((doc) => doc.documentKey),
    };

    this.logger.log(
      `OFFICIAL_SYNC dryRun=${report.dryRun} ` +
        Object.entries(countOutcomes(documents))
          .map(([outcome, count]) => `${outcome}=${count}`)
          .join(' ') +
        ` missing=${report.missingFromListing.length}`,
    );
    return report;
  }

  private async readListings(
    sources: readonly ConitecListingSource[],
  ): Promise<Array<{ source: ConitecListingSource; items: ConitecListingItem[] }>> {
    const listings = [];
    for (const source of sources) {
      const items = parseConitecListing(await this.fetcher.fetchText(source.url), source.kind);
      if (items.length < source.minItems) {
        throw new ListingIntegrityError(
          `Lista ${source.label} com ${items.length} itens (piso ${source.minItems}). ` +
            'Provável mudança no HTML da Conitec — nada foi gravado.',
        );
      }
      listings.push({ source, items });
    }
    return listings;
  }

  private async syncDocument(
    item: ConitecListingItem,
    kindLabel: string,
    current: ActiveDocument | undefined,
    options: SyncOptions,
  ): Promise<DocumentReport> {
    const base = { documentKey: item.documentKey, title: item.title };

    // Alguns Protocolos de Uso apontam para a portaria em HTML (bvsms): não é
    // PDF e não deve virar erro recorrente no relatório mensal.
    if (HTML_PAGE_PATTERN.test(item.documentUrl)) {
      return { ...base, outcome: 'not_pdf', detail: item.documentUrl };
    }

    try {
      const pdf = await this.fetcher.fetchPdf(item.documentUrl);
      if (!pdf) {
        return { ...base, outcome: 'not_pdf', detail: item.documentUrl };
      }

      const sha256 = createHash('sha256').update(pdf).digest('hex');
      if (current?.pdfSha256 === sha256 && !options.reclassify) {
        return { ...base, outcome: 'unchanged' };
      }

      const { text, pages } = await readPdfText(pdf);
      const document = sectionDocument(normalizePdfText(text));
      const includedChars = document.sections
        .filter((section) => section.included)
        .reduce((sum, section) => sum + section.text.length, 0);
      if (includedChars === 0) {
        return { ...base, outcome: 'error', detail: 'nenhum texto extraído (PDF digitalizado?)' };
      }

      const classification = options.dryRun
        ? heuristicClassification(item)
        : await this.classify(item, kindLabel, document);

      if (current?.pdfSha256 === sha256) {
        // --reclassify num documento sem mudança: só a classificação muda.
        if (!options.dryRun) await this.updateClassification(current.id, classification);
        return { ...base, outcome: 'reclassified', classification: summarize(classification) };
      }

      const sameListingEntry =
        current?.normativeAct === item.normativeAct &&
        current?.annexUpdatedAt?.getTime() === item.annexUpdatedAt?.getTime();
      const fetchedAt = new Date();
      const sourceVersion = officialSourceVersion(item, sameListingEntry ? fetchedAt : undefined);
      const chunks = buildOfficialChunks({
        item,
        kindLabel,
        document,
        classification,
        sourceVersion,
      });

      if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
        return {
          ...base,
          outcome: 'error',
          detail: `${chunks.length} chunks (teto ${MAX_CHUNKS_PER_DOCUMENT}) — revisar o recorte`,
        };
      }

      const report: DocumentReport = {
        ...base,
        outcome: current ? 'updated' : 'new',
        sectioning: document.sectioning,
        includedShare: Math.round((includedChars / text.length) * 100) / 100,
        chunks: chunks.length,
        classification: summarize(classification),
      };
      if (options.dryRun) return report;

      const previousVersion = await this.prisma.officialGuidelineDocument.findUnique({
        where: { documentKey_pdfSha256: { documentKey: item.documentKey, pdfSha256: sha256 } },
        select: { id: true },
      });
      if (previousVersion) {
        // O PDF voltou a uma versão já coletada: reativa em vez de duplicar.
        await this.reactivate(previousVersion.id, current?.id);
        return { ...report, outcome: 'reactivated', chunks: undefined };
      }

      const embeddings = await this.embed(chunks.map((chunk) => chunk.text));
      await this.persist({
        item,
        kindLabel,
        sha256,
        pages,
        document,
        classification,
        sourceVersion,
        chunks,
        embeddings,
        fetchedAt,
        previousId: current?.id,
      });

      await this.auditService
        .log({
          actorId: 'system',
          action: 'OFFICIAL_GUIDELINE_SYNCED',
          entity: 'OfficialGuidelineDocument',
          entityId: `${item.documentKey}@${sha256.slice(0, 12)}`,
          payload: {
            documentKey: item.documentKey,
            outcome: report.outcome,
            sourceVersion,
            chunks: chunks.length,
            careSetting: classification.careSetting,
            classificationSource: classification.source,
          },
        })
        .catch(() => undefined);

      return report;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`OFFICIAL_SYNC_DOCUMENT_FAILED ${item.documentKey}: ${detail}`);
      return { ...base, outcome: 'error', detail };
    }
  }

  private async classify(
    item: ConitecListingItem,
    kindLabel: string,
    document: SectionedDocument,
  ): Promise<DocumentClassification> {
    try {
      const response = await this.aiGateway.complete({
        messages: buildClassificationMessages({
          kind: item.kind,
          kindLabel,
          title: item.title,
          document,
        }),
        temperature: 0,
        maxTokens: 500,
      });
      const parsed = parseClassification(response.content, response.model);
      if (!('error' in parsed)) return parsed;
      this.logger.warn(`Classificação inválida para ${item.documentKey}: ${parsed.error}`);
    } catch (err) {
      this.logger.warn(
        `Classificação indisponível para ${item.documentKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return heuristicClassification(item);
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH) {
      const response = await this.aiGateway.embed(texts.slice(start, start + EMBEDDING_BATCH));
      embeddings.push(...response.embeddings);
    }
    if (embeddings.length !== texts.length) {
      throw new Error(`Embeddings incompletos: ${embeddings.length} de ${texts.length}`);
    }
    return embeddings;
  }

  private async persist(input: {
    item: ConitecListingItem;
    kindLabel: string;
    sha256: string;
    pages: number;
    document: SectionedDocument;
    classification: DocumentClassification;
    sourceVersion: string;
    chunks: OfficialChunk[];
    embeddings: number[][];
    fetchedAt: Date;
    previousId?: string;
  }): Promise<void> {
    const { item, classification } = input;
    const source = officialSource(input.kindLabel, item.title);

    await this.prisma.$transaction(
      async (tx) => {
        // Antes de criar a nova: o índice parcial só admite uma versão ativa.
        if (input.previousId) await supersede(tx, input.previousId, input.fetchedAt);

        const created = await tx.officialGuidelineDocument.create({
          data: {
            kind: item.kind,
            documentKey: item.documentKey,
            title: item.title,
            normativeAct: item.normativeAct,
            publishedAt: item.publishedAt,
            annexUpdatedAt: item.annexUpdatedAt,
            documentUrl: item.documentUrl,
            normativeActUrl: item.normativeActUrl,
            summaryUrl: item.summaryUrl,
            pdfSha256: input.sha256,
            pageCount: input.pages,
            cid10: input.document.cid10,
            sections: input.document.sections.map((section) => ({
              number: section.number,
              title: section.title,
              included: section.included,
              chars: section.text.length,
            })),
            sectioning: input.document.sectioning,
            careSetting: classification.careSetting,
            population: classification.population,
            specialty: classification.specialty,
            cenarios: classification.cenarios,
            classification: classificationJson(classification),
            chunkCount: input.chunks.length,
            fetchedAt: input.fetchedAt,
          },
          select: { id: true },
        });

        for (const [index, chunk] of input.chunks.entries()) {
          const embedding = `[${input.embeddings[index]!.join(',')}]`;
          await tx.$executeRaw`
            INSERT INTO "guideline_chunks"
              (id, source, source_version, specialty, text, metadata, status, document_id, valid_from, embedding)
            VALUES (
              ${randomUUID()}::uuid, ${source}, ${input.sourceVersion}, ${classification.specialty},
              ${chunk.text}, ${JSON.stringify(chunk.metadata)}::jsonb,
              'official_unreviewed'::"GuidelineChunkStatus", ${created.id}::uuid,
              ${input.fetchedAt}, ${embedding}::vector
            )`;
        }
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  private async reactivate(documentId: string, currentId: string | undefined): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (currentId) await supersede(tx, currentId, now);
      await tx.officialGuidelineDocument.update({
        where: { id: documentId },
        data: { status: OfficialDocumentStatus.active, supersededAt: null, fetchedAt: now },
      });
      await tx.guidelineChunk.updateMany({
        where: { documentId, status: GuidelineChunkStatus.superseded },
        data: { status: GuidelineChunkStatus.official_unreviewed, validTo: null },
      });
    });
  }

  private async updateClassification(
    documentId: string,
    classification: DocumentClassification,
  ): Promise<void> {
    await this.prisma.officialGuidelineDocument.update({
      where: { id: documentId },
      data: {
        careSetting: classification.careSetting,
        population: classification.population,
        specialty: classification.specialty,
        cenarios: classification.cenarios,
        classification: classificationJson(classification),
      },
    });
    // Os chunks carregam careSetting/cenarios na metadata para o retrieval.
    await this.prisma.$executeRaw`
      UPDATE "guideline_chunks"
      SET metadata = metadata
            || jsonb_build_object('careSetting', ${classification.careSetting}::text)
            || jsonb_build_object('cenarios', ${JSON.stringify(classification.cenarios)}::jsonb),
          specialty = ${classification.specialty}
      WHERE document_id = ${documentId}::uuid`;
  }
}

async function supersede(
  tx: Prisma.TransactionClient,
  documentId: string,
  at: Date,
): Promise<void> {
  await tx.officialGuidelineDocument.update({
    where: { id: documentId },
    data: { status: OfficialDocumentStatus.superseded, supersededAt: at },
  });
  // Chunks antigos não são apagados: rastreiam qual versão embasou uma
  // análise passada.
  await tx.guidelineChunk.updateMany({
    where: { documentId, status: GuidelineChunkStatus.official_unreviewed },
    data: { status: GuidelineChunkStatus.superseded, validTo: at },
  });
}

function classificationJson(classification: DocumentClassification): Prisma.InputJsonObject {
  return {
    source: classification.source,
    model: classification.model ?? null,
    rationale: classification.rationale,
    classifiedAt: new Date().toISOString(),
  };
}

function summarize(
  classification: DocumentClassification,
): Pick<DocumentClassification, 'careSetting' | 'source' | 'cenarios'> {
  return {
    careSetting: classification.careSetting,
    source: classification.source,
    cenarios: classification.cenarios,
  };
}

export function countOutcomes(
  documents: DocumentReport[],
): Partial<Record<DocumentOutcome, number>> {
  const counts: Partial<Record<DocumentOutcome, number>> = {};
  for (const document of documents) counts[document.outcome] = (counts[document.outcome] ?? 0) + 1;
  return counts;
}
