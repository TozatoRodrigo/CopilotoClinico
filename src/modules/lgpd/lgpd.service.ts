import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhysicianErasureCheck } from '../auth/physician-erasure-check.service';
import { consentScopes, type ConsentScope } from './schemas/lgpd.schemas';
import type {
  Prisma,
  Physician,
  Consent,
  Encounter,
  Document as DocumentRecord,
  AiInteraction,
  CaseIntake,
  AuditLog,
  RecommendationDecision,
  CopilotFeedback,
} from '@prisma/client';

/**
 * Captura de áudio na exportação: metadados e transcrição (já mascarada de
 * PII). `encryptedContent` fica de fora: é o áudio bruto cifrado com a chave do
 * servidor, inútil para o titular, e decifrá-lo poria a voz do paciente, sem
 * máscara, num JSON baixado pelo navegador. Allowlist em vez de `omit`: coluna
 * nova em `audio_captures` só entra na exportação se for listada aqui.
 */
const EXPORTED_AUDIO_CAPTURE_SELECT = {
  id: true,
  encounterId: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  transcribedText: true,
  retainUntil: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AudioCaptureSelect;

export type ExportedAudioCapture = Prisma.AudioCaptureGetPayload<{
  select: typeof EXPORTED_AUDIO_CAPTURE_SELECT;
}>;

export interface PhysicianDataExport {
  exportVersion: 'lgpd-portability-v1';
  generatedAt: string;
  dataSubject: {
    type: 'physician';
    id: string;
  };
  data: {
    // CC-018 — erasedAt fica de fora: é sempre null para quem ainda consegue
    // pedir a exportação (o cadastro eliminado não tem mais sessão).
    physician: Omit<Physician, 'passwordHash' | 'mfaSecret' | 'mfaEnabled' | 'erasedAt'>;
    encounters: Encounter[];
    documents: DocumentRecord[];
    aiInteractions: AiInteraction[];
    /** ADR-014 — conversas antes do plano (caso e respostas já redigidos). */
    caseIntakes: CaseIntake[];
    /** F0-D — Adotar/Rejeitar/Anotar por recomendação (notas já mascaradas). */
    recommendationDecisions: RecommendationDecision[];
    /** F0-D — reportes do médico sobre análises (comentário já mascarado). */
    copilotFeedback: CopilotFeedback[];
    /** Capturas de áudio, inclusive as com o áudio já eliminado (`status: deleted`). */
    audioCaptures: ExportedAudioCapture[];
    consents: Consent[];
    auditLog: AuditLog[];
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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PhysicianErasureCheck) private readonly erasureCheck: PhysicianErasureCheck,
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

    const [
      documents,
      consents,
      auditLog,
      aiInteractions,
      recommendationDecisions,
      copilotFeedback,
      caseIntakes,
      audioCaptures,
    ] = await Promise.all([
      this.prisma.document.findMany({ where: { physicianId } }),
      this.prisma.consent.findMany({ where: { physicianId } }),
      this.prisma.auditLog.findMany({ where: { actorId: physicianId } }),
      encounterIds.length > 0
        ? this.prisma.aiInteraction.findMany({
            where: { encounterId: { in: encounterIds } },
          })
        : Promise.resolve([]),
      this.prisma.recommendationDecision.findMany({ where: { physicianId } }),
      this.prisma.copilotFeedback.findMany({ where: { physicianId } }),
      // ADR-014 — a conversa antes do plano (caso e respostas já redigidos).
      this.prisma.caseIntake.findMany({ where: { physicianId } }),
      this.prisma.audioCapture.findMany({
        where: { physicianId },
        select: EXPORTED_AUDIO_CAPTURE_SELECT,
      }),
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
        documents,
        aiInteractions,
        caseIntakes,
        recommendationDecisions,
        copilotFeedback,
        audioCaptures,
        consents,
        auditLog,
      },
    };
  }

  async requestErasure(physicianId: string): Promise<{
    status: string;
    estimatedCompletion: Date;
    erased: {
      recommendationDecisions: number;
      copilotFeedback: number;
      encounters: number;
      consents: number;
      refreshTokens: number;
    };
  }> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
    });

    if (!physician) {
      throw new NotFoundException('Physician not found');
    }

    const erased = await this.prisma.$transaction(async (tx) => {
      // F0-D — o CASCADE de encounters já levaria decisões e feedback junto;
      // apagar explicitamente deixa a contagem no relatório de eliminação.
      const recommendationDecisions = await tx.recommendationDecision.deleteMany({
        where: { physicianId },
      });
      const copilotFeedback = await tx.copilotFeedback.deleteMany({ where: { physicianId } });
      const encounters = await tx.encounter.deleteMany({ where: { physicianId } });
      const consents = await tx.consent.deleteMany({ where: { physicianId } });
      const refreshTokens = await tx.refreshToken.deleteMany({ where: { physicianId } });

      await tx.physician.update({
        where: { id: physicianId },
        data: {
          name: 'ERASED',
          email: `erased-${physicianId}@erased.com`,
          passwordHash: `erased:${physicianId}`,
          // CC-018 — a estratégia JWT e o refresh recusam a sessão por aqui.
          erasedAt: new Date(),
        },
      });

      return {
        recommendationDecisions: recommendationDecisions.count,
        copilotFeedback: copilotFeedback.count,
        encounters: encounters.count,
        consents: consents.count,
        refreshTokens: refreshTokens.count,
      };
    });

    // CC-018 — só depois do commit: marcar antes trancaria o médico fora de uma
    // conta que continua dele quando a transação falha.
    this.erasureCheck.markErased(physicianId);

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
}
