import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type LegalDocument } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { readBooleanFlag } from '../../config/feature-flag';
import { AuditService } from '../audit/audit.service';
import {
  GATED_LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENT_TYPE_LABELS,
  type LegalAcceptanceStats,
  type LegalAdminOverview,
  type LegalDocumentType,
  type LegalDocumentView,
  type LegalStatus,
  type PendingLegalDocument,
} from '../../shared/contracts/legal';
import { LEGAL_DOCUMENT_CATALOG, findLegalDocumentDraft } from './legal-document-catalog';
import { legalDocumentHash } from './legal-document-hash';
import { LegalDocumentOutdatedException } from './legal.errors';
import { legalDocumentSectionsSchema, type PublishLegalDocumentInput } from './legal.schemas';

/** Desligada (padrão), ninguém é bloqueado e a tela de aceite não aparece. */
export const LEGAL_TERMS_V2_FLAG = 'LEGAL_TERMS_V2';

/**
 * O gate consulta as versões vigentes a cada requisição autenticada: elas
 * ficam em memória por este tempo. Publicar limpa o cache desta instância; as
 * outras passam a exigir a versão nova em até 30 s.
 */
const CURRENT_DOCUMENTS_TTL_MS = 30_000;

/**
 * Conta eliminada (LgpdService.requestErasure troca a senha por
 * `erased:<id>`) não entra no percentual de aceite.
 */
const NOT_ERASED: Prisma.PhysicianWhereInput = {
  NOT: { passwordHash: { startsWith: 'erased:' } },
};

interface AcceptedVersion {
  documentId: string;
  document: { type: string; version: string; publishedAt: Date };
}

/**
 * CC-905 — documentos legais versionados (termos de uso, política de
 * privacidade) e o aceite de cada médico. Genérico de propósito: o termo do
 * beta e o da mentoria podem virar tipos novos daqui (ver o PR da CC-905).
 */
@Injectable()
export class LegalDocumentsService {
  private readonly logger = new Logger(LegalDocumentsService.name);
  private currentCache: { expiresAt: number; documents: LegalDocument[] } | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** Lida a cada chamada: liga e desliga sem redeploy. */
  isGateEnabled(): boolean {
    return readBooleanFlag(this.config, LEGAL_TERMS_V2_FLAG, false);
  }

  /**
   * Falta aceitar alguma versão vigente dos tipos exigidos? Uma consulta
   * indexada por requisição; sem nada publicado, nada é exigido.
   */
  async hasPendingAcceptance(physicianId: string): Promise<boolean> {
    const current = await this.currentGatedDocuments();
    if (current.length === 0) return false;
    const accepted = await this.prisma.legalAcceptance.count({
      where: { physicianId, documentId: { in: current.map((document) => document.id) } },
    });
    return accepted < current.length;
  }

  async status(physicianId: string): Promise<LegalStatus> {
    if (!this.isGateEnabled()) {
      return { enabled: false, acceptanceRequired: false, pending: [] };
    }
    const current = await this.currentGatedDocuments();
    if (current.length === 0) {
      return { enabled: true, acceptanceRequired: false, pending: [] };
    }

    const accepted: AcceptedVersion[] = await this.prisma.legalAcceptance.findMany({
      where: { physicianId, document: { type: { in: [...GATED_LEGAL_DOCUMENT_TYPES] } } },
      select: {
        documentId: true,
        document: { select: { type: true, version: true, publishedAt: true } },
      },
    });
    const acceptedIds = new Set(accepted.map((acceptance) => acceptance.documentId));
    const pending: PendingLegalDocument[] = current
      .filter((document) => !acceptedIds.has(document.id))
      .map((document) => ({
        ...this.toView(document),
        previouslyAcceptedVersion: latestAcceptedVersion(accepted, document.type),
      }));

    return { enabled: true, acceptanceRequired: pending.length > 0, pending };
  }

  /**
   * Registra o aceite das versões que o médico leu. Cada id precisa ser a
   * vigente do seu tipo (sem cache: logo depois de uma publicação, a tela
   * aberta com o texto antigo recebe 409 e recarrega). Aceitar de novo é
   * idempotente e não repete a entrada na trilha.
   */
  async accept(physicianId: string, documentIds: readonly string[]): Promise<LegalStatus> {
    const current = await this.currentGatedDocuments({ fresh: true });
    const currentById = new Map(current.map((document) => [document.id, document]));
    const requested = [...new Set(documentIds)].map((id) => currentById.get(id));
    const documents = requested.filter(
      (document): document is LegalDocument => document !== undefined,
    );
    if (documents.length !== requested.length) {
      throw new LegalDocumentOutdatedException();
    }

    const existing = await this.prisma.legalAcceptance.findMany({
      where: { physicianId, documentId: { in: documents.map((document) => document.id) } },
      select: { documentId: true },
    });
    const alreadyAccepted = new Set(existing.map((acceptance) => acceptance.documentId));
    const newlyAccepted = documents.filter((document) => !alreadyAccepted.has(document.id));

    if (newlyAccepted.length > 0) {
      await this.prisma.legalAcceptance.createMany({
        data: newlyAccepted.map((document) => ({ physicianId, documentId: document.id })),
        skipDuplicates: true,
      });
      for (const document of newlyAccepted) {
        await this.auditSilently({
          actorId: physicianId,
          action: 'LEGAL_DOCUMENT_ACCEPTED',
          entityId: document.id,
          payload: {
            type: document.type,
            version: document.version,
            contentHash: document.contentHash,
          },
        });
      }
      this.logger.log(
        `LEGAL_DOCUMENTS_ACCEPTED physicianId=${physicianId} documents=${newlyAccepted
          .map((document) => `${document.type}@${document.version}`)
          .join(',')}`,
      );
    }

    return this.status(physicianId);
  }

  /**
   * Publica uma versão do catálogo do código (só ADMIN, pelo controller).
   * Versão já publicada não muda: o mesmo texto vira 409 "já publicada", e um
   * texto alterado com a versão antiga vira 409 pedindo versão nova.
   */
  async publish(adminId: string, input: PublishLegalDocumentInput): Promise<LegalDocumentView> {
    const draft = findLegalDocumentDraft(input.type, input.version);
    if (!draft) {
      throw new NotFoundException('Versão não encontrada no catálogo do código.');
    }
    const contentHash = legalDocumentHash(draft);

    const existing = await this.prisma.legalDocument.findUnique({
      where: { type_version: { type: draft.type, version: draft.version } },
      select: { contentHash: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.contentHash === contentHash
          ? 'Esta versão já está publicada.'
          : 'O texto desta versão mudou depois de publicado. Crie uma versão nova no catálogo.',
      );
    }

    let document: LegalDocument;
    try {
      document = await this.prisma.legalDocument.create({
        data: {
          type: draft.type,
          version: draft.version,
          title: draft.title,
          sections: draft.sections.map((section) => ({
            heading: section.heading,
            paragraphs: [...section.paragraphs],
          })),
          changeSummary: [...draft.changeSummary],
          contentHash,
          provisional: draft.provisional,
          publishedById: adminId,
        },
      });
    } catch (err) {
      // Dois cliques ao mesmo tempo: o índice único (type, version) decide.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Esta versão já está publicada.');
      }
      throw err;
    }

    this.currentCache = null;
    await this.auditSilently({
      actorId: adminId,
      action: 'LEGAL_DOCUMENT_PUBLISHED',
      entityId: document.id,
      payload: {
        type: document.type,
        version: document.version,
        contentHash: document.contentHash,
        provisional: document.provisional,
      },
    });
    this.logger.log(
      `LEGAL_DOCUMENT_PUBLISHED type=${document.type} version=${document.version} ` +
        `hash=${document.contentHash.slice(0, 12)} provisional=${document.provisional} by=${adminId}`,
    );

    return this.toView(document);
  }

  /** Console admin: vigente, % de aceite, histórico e versões a publicar por tipo. */
  async adminOverview(): Promise<LegalAdminOverview> {
    const [published, eligibleAccounts] = await Promise.all([
      this.prisma.legalDocument.findMany({
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        include: {
          _count: { select: { acceptances: { where: { physician: NOT_ERASED } } } },
        },
      }),
      this.prisma.physician.count({ where: NOT_ERASED }),
    ]);

    const types = LEGAL_DOCUMENT_TYPES.map((type) => {
      const versions = published.filter((document) => document.type === type);
      const current = versions[0] ?? null;
      const publishedVersions = new Set(versions.map((document) => document.version));
      return {
        type,
        label: LEGAL_DOCUMENT_TYPE_LABELS[type],
        current: current
          ? {
              ...this.toView(current),
              acceptance: acceptanceStats(current._count.acceptances, eligibleAccounts),
            }
          : null,
        history: versions.map((document) => ({
          id: document.id,
          version: document.version,
          provisional: document.provisional,
          contentHash: document.contentHash,
          publishedAt: document.publishedAt.toISOString(),
          accepted: document._count.acceptances,
        })),
        drafts: LEGAL_DOCUMENT_CATALOG.filter(
          (draft) => draft.type === type && !publishedVersions.has(draft.version),
        ).map((draft) => ({
          version: draft.version,
          title: draft.title,
          provisional: draft.provisional,
          contentHash: legalDocumentHash(draft),
          changeSummary: draft.changeSummary,
        })),
      };
    });

    const gatedCurrentIds = types
      .filter((entry) => GATED_LEGAL_DOCUMENT_TYPES.includes(entry.type))
      .flatMap((entry) => (entry.current ? [entry.current.id] : []));

    return {
      enabled: this.isGateEnabled(),
      eligibleAccounts,
      fullyAccepted:
        gatedCurrentIds.length === 0 ? null : await this.countFullyAccepted(gatedCurrentIds),
      types,
    };
  }

  /** Contas não eliminadas com aceite de todas as versões indicadas. */
  private async countFullyAccepted(documentIds: string[]): Promise<number> {
    const perPhysician = await this.prisma.legalAcceptance.groupBy({
      by: ['physicianId'],
      where: { documentId: { in: documentIds }, physician: NOT_ERASED },
      _count: { documentId: true },
    });
    // (physicianId, documentId) é único: contar todos os ids = aceitou todos.
    return perPhysician.filter((group) => group._count.documentId === documentIds.length).length;
  }

  /** A última publicada de cada tipo exigido, com cache curto (ver TTL). */
  private async currentGatedDocuments(options: { fresh?: boolean } = {}): Promise<LegalDocument[]> {
    const now = Date.now();
    if (!options.fresh && this.currentCache && this.currentCache.expiresAt > now) {
      return this.currentCache.documents;
    }
    const latest = await Promise.all(
      GATED_LEGAL_DOCUMENT_TYPES.map((type) =>
        this.prisma.legalDocument.findFirst({
          where: { type },
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        }),
      ),
    );
    const documents = latest.filter((document): document is LegalDocument => document !== null);
    this.currentCache = { expiresAt: now + CURRENT_DOCUMENTS_TTL_MS, documents };
    return documents;
  }

  private toView(document: LegalDocument): LegalDocumentView {
    return {
      id: document.id,
      type: parseLegalDocumentType(document.type),
      version: document.version,
      title: document.title,
      provisional: document.provisional,
      contentHash: document.contentHash,
      publishedAt: document.publishedAt.toISOString(),
      changeSummary: document.changeSummary,
      sections: legalDocumentSectionsSchema.parse(document.sections),
    };
  }

  /**
   * O aceite e a publicação já estão gravados quando a trilha é escrita; uma
   * falha da trilha não desfaz nem esconde o aceite (o gate lê a tabela).
   */
  private async auditSilently(entry: {
    actorId: string;
    action: 'LEGAL_DOCUMENT_ACCEPTED' | 'LEGAL_DOCUMENT_PUBLISHED';
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.audit.log({ ...entry, entity: 'LegalDocument' });
    } catch (err) {
      this.logger.error(
        `LEGAL_AUDIT_FAILED action=${entry.action} documentId=${entry.entityId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function parseLegalDocumentType(type: string): LegalDocumentType {
  const known = LEGAL_DOCUMENT_TYPES.find((candidate) => candidate === type);
  if (!known) {
    throw new Error(`Tipo de documento legal desconhecido no banco: ${type}`);
  }
  return known;
}

function latestAcceptedVersion(accepted: AcceptedVersion[], type: string): string | null {
  const sameType = accepted
    .filter((acceptance) => acceptance.document.type === type)
    .sort((a, b) => b.document.publishedAt.getTime() - a.document.publishedAt.getTime());
  return sameType[0]?.document.version ?? null;
}

function acceptanceStats(accepted: number, eligible: number): LegalAcceptanceStats {
  return {
    accepted,
    eligible,
    percent: eligible === 0 ? 0 : Math.round((accepted / eligible) * 1000) / 10,
  };
}
