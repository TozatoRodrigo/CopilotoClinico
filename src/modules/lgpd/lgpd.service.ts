import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { consentScopes, type ConsentScope } from './schemas/lgpd.schemas';
import type {
  Physician,
  Consent,
  Encounter,
  EncounterAttachment,
  AudioCapture,
  Document as DocumentRecord,
  AiInteraction,
  AuditLog,
} from '@prisma/client';

/**
 * Captura de áudio na exportação: metadados e transcrição (já mascarada de
 * PII), sem o áudio. `encryptedContent` é cifrado com a chave do servidor —
 * inútil para o titular — e decifrá-lo poria a voz do paciente, sem máscara
 * nenhuma, num JSON baixado pelo navegador. O resto da exportação segue a
 * mesma regra: só texto redigido.
 */
export type ExportedAudioCapture = Omit<AudioCapture, 'encryptedContent'>;

export interface PhysicianDataExport {
  exportVersion: 'lgpd-portability-v1';
  generatedAt: string;
  dataSubject: {
    type: 'physician';
    id: string;
  };
  data: {
    physician: Omit<Physician, 'passwordHash' | 'mfaSecret' | 'mfaEnabled'>;
    encounters: Encounter[];
    /**
     * O arquivo original nunca é gravado (LGPD-005, ver AttachmentsService):
     * o texto extraído e mascarado é todo o conteúdo que guardamos, então vai
     * inline — não há objeto no storage para referenciar.
     */
    encounterAttachments: EncounterAttachment[];
    audioCaptures: ExportedAudioCapture[];
    documents: DocumentRecord[];
    aiInteractions: AiInteraction[];
    consents: Consent[];
    auditLog: AuditLog[];
  };
}

export interface ErasureResult {
  status: 'completed';
  estimatedCompletion: Date;
  erased: {
    encounters: number;
    encounterAttachments: number;
    audioCaptures: number;
    consents: number;
    refreshTokens: number;
    /** PDFs de documentos confirmados apagados do MinIO. */
    storageObjects: number;
  };
}

export interface ConsentScopeStatus {
  scope: ConsentScope;
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async grantConsent(physicianId: string, scope: string): Promise<Consent> {
    const consentScope = this.parseConsentScope(scope);
    const activeConsent = await this.prisma.consent.findFirst({
      where: { physicianId, scope: consentScope, revokedAt: null },
    });

    if (activeConsent) {
      return activeConsent;
    }

    const consent = await this.prisma.consent.create({
      data: { physicianId, scope: consentScope },
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'CONSENT_GRANTED',
      entity: 'Consent',
      entityId: consent.id,
      payload: { scope: consentScope },
    });

    return consent;
  }

  async listConsentScopes(physicianId: string): Promise<ConsentScopeStatus[]> {
    const consents = await this.prisma.consent.findMany({
      where: { physicianId },
      orderBy: { grantedAt: 'desc' },
    });

    return consentScopes.map((scope) => {
      const latestConsent = consents.find((consent) => consent.scope === scope);

      return {
        scope,
        granted: latestConsent?.revokedAt === null,
        grantedAt: latestConsent?.grantedAt ?? null,
        revokedAt: latestConsent?.revokedAt ?? null,
      };
    });
  }

  async revokeConsent(physicianId: string, scope: string): Promise<Consent> {
    const consentScope = this.parseConsentScope(scope);
    const consent = await this.prisma.consent.findFirst({
      where: { physicianId, scope: consentScope, revokedAt: null },
    });

    if (!consent) {
      throw new NotFoundException('Active consent not found');
    }

    const revokedConsent = await this.prisma.consent.update({
      where: { id: consent.id },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'CONSENT_REVOKED',
      entity: 'Consent',
      entityId: consent.id,
      payload: { scope: consentScope },
    });

    return revokedConsent;
  }

  async checkConsent(physicianId: string, scope: string): Promise<boolean> {
    const consentScope = this.parseConsentScope(scope);
    const consent = await this.prisma.consent.findFirst({
      where: { physicianId, scope: consentScope, revokedAt: null },
    });
    return consent !== null;
  }

  private parseConsentScope(scope: string): ConsentScope {
    if (!consentScopes.includes(scope as ConsentScope)) {
      throw new BadRequestException(`Unsupported consent scope: ${scope}`);
    }

    return scope as ConsentScope;
  }

  async exportPhysicianData(physicianId: string): Promise<PhysicianDataExport> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: {
        id: true,
        role: true,
        crmUf: true,
        crmNumber: true,
        email: true,
        name: true,
        crmVerified: true,
        isCurator: true,
        subscriptionStatus: true,
        locale: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!physician) {
      throw new NotFoundException('Physician not found');
    }

    const encounters = await this.prisma.encounter.findMany({
      where: { physicianId },
    });

    const encounterIds = encounters.map((e) => e.id);
    const hasEncounters = encounterIds.length > 0;
    const ofEncounters = { encounterId: { in: encounterIds } };

    const [documents, consents, auditLog, aiInteractions, encounterAttachments, audioCaptures] =
      await Promise.all([
        this.prisma.document.findMany({ where: { physicianId } }),
        this.prisma.consent.findMany({ where: { physicianId } }),
        this.prisma.auditLog.findMany({ where: { actorId: physicianId } }),
        hasEncounters
          ? this.prisma.aiInteraction.findMany({ where: ofEncounters })
          : Promise.resolve([]),
        hasEncounters
          ? this.prisma.encounterAttachment.findMany({ where: ofEncounters })
          : Promise.resolve([]),
        hasEncounters
          ? this.prisma.audioCapture.findMany({
              where: ofEncounters,
              omit: { encryptedContent: true },
            })
          : Promise.resolve([]),
      ]);

    return {
      exportVersion: 'lgpd-portability-v1',
      generatedAt: new Date().toISOString(),
      dataSubject: {
        type: 'physician',
        id: physicianId,
      },
      data: {
        physician,
        encounters,
        encounterAttachments,
        audioCaptures,
        documents,
        aiInteractions,
        consents,
        auditLog,
      },
    };
  }

  async requestErasure(physicianId: string): Promise<ErasureResult> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
    });

    if (!physician) {
      throw new NotFoundException('Physician not found');
    }

    // Storage antes do banco: as chaves dos PDFs só existem nas linhas de
    // Document, que a transação abaixo apaga (cascata do Encounter). Se o
    // storage falhar, nada foi apagado e o pedido pode ser repetido; na ordem
    // inversa, uma falha deixaria PDFs órfãos sem referência para achá-los.
    const storageObjects = await this.eraseDocumentPdfs(physicianId);

    const erasedRows = await this.prisma.$transaction(async (tx) => {
      // Anexos e capturas de áudio cairiam na cascata do Encounter de qualquer
      // forma; apagá-los explicitamente dá a contagem que vai para a resposta e
      // para a trilha de auditoria. Nenhum dos dois tem objeto no storage: o
      // anexo guarda só o texto mascarado e o áudio fica cifrado na própria linha.
      const encounterAttachments = await tx.encounterAttachment.deleteMany({
        where: { encounter: { physicianId } },
      });
      const audioCaptures = await tx.audioCapture.deleteMany({
        where: { encounter: { physicianId } },
      });
      const encounters = await tx.encounter.deleteMany({ where: { physicianId } });
      const consents = await tx.consent.deleteMany({ where: { physicianId } });
      const refreshTokens = await tx.refreshToken.deleteMany({ where: { physicianId } });

      await tx.physician.update({
        where: { id: physicianId },
        data: {
          name: 'ERASED',
          email: `erased-${physicianId}@erased.com`,
          passwordHash: `erased:${physicianId}`,
        },
      });

      return {
        encounters: encounters.count,
        encounterAttachments: encounterAttachments.count,
        audioCaptures: audioCaptures.count,
        consents: consents.count,
        refreshTokens: refreshTokens.count,
      };
    });

    const erased = { ...erasedRows, storageObjects };

    // A trilha de auditoria é append-only (AUD-001) e não é apagada: só ganha
    // esta entrada.
    await this.auditService.log({
      actorId: physicianId,
      action: 'DATA_ERASURE',
      entity: 'Physician',
      entityId: physicianId,
      payload: {
        reason: 'LGPD Art. 18, VI - Data erasure request',
        erased,
      },
    });

    return { status: 'completed', estimatedCompletion: new Date(), erased };
  }

  /**
   * Apaga do MinIO os PDFs dos documentos confirmados nos atendimentos do
   * médico e devolve quantas chaves foram apagadas.
   */
  private async eraseDocumentPdfs(physicianId: string): Promise<number> {
    const documents = await this.prisma.document.findMany({
      where: { encounter: { physicianId }, pdfObjectKey: { not: null } },
      select: { pdfObjectKey: true },
    });
    const keys = documents.flatMap((doc) => (doc.pdfObjectKey ? [doc.pdfObjectKey] : []));

    try {
      await this.storage.deleteObjects(keys);
    } catch (error) {
      this.logger.error(
        `LGPD erasure aborted for physician ${physicianId}: failed to delete ${keys.length} stored PDF(s)`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Could not delete stored files; no data was erased. Try again later.',
        { cause: error },
      );
    }

    return keys.length;
  }
}
