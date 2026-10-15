import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { consentScopes, type ConsentScope } from './schemas/lgpd.schemas';
import type {
  Physician,
  Consent,
  LegalDocument,
  Encounter,
  Document as DocumentRecord,
  AiInteraction,
  CaseIntake,
  AuditLog,
  RecommendationDecision,
  CopilotFeedback,
} from '@prisma/client';

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
    documents: DocumentRecord[];
    aiInteractions: AiInteraction[];
    /** ADR-014 — conversas antes do plano (caso e respostas já redigidos). */
    caseIntakes: CaseIntake[];
    /** F0-D — Adotar/Rejeitar/Anotar por recomendação (notas já mascaradas). */
    recommendationDecisions: RecommendationDecision[];
    /** F0-D — reportes do médico sobre análises (comentário já mascarado). */
    copilotFeedback: CopilotFeedback[];
    consents: Consent[];
    /** CC-905 — versões dos termos e da política que o médico aceitou, e quando. */
    legalAcceptances: Array<{
      acceptedAt: Date;
      document: Pick<
        LegalDocument,
        'type' | 'version' | 'contentHash' | 'provisional' | 'publishedAt'
      >;
    }>;
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
      legalAcceptances,
      auditLog,
      aiInteractions,
      recommendationDecisions,
      copilotFeedback,
      caseIntakes,
    ] = await Promise.all([
      this.prisma.document.findMany({ where: { physicianId } }),
      this.prisma.consent.findMany({ where: { physicianId } }),
      this.prisma.legalAcceptance.findMany({
        where: { physicianId },
        orderBy: { acceptedAt: 'asc' },
        select: {
          acceptedAt: true,
          document: {
            select: {
              type: true,
              version: true,
              contentHash: true,
              provisional: true,
              publishedAt: true,
            },
          },
        },
      }),
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
        consents,
        legalAcceptances,
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
      legalAcceptances: number;
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
      // CC-905 — o aceite sai com a conta; o evento continua na trilha.
      const legalAcceptances = await tx.legalAcceptance.deleteMany({ where: { physicianId } });
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
        recommendationDecisions: recommendationDecisions.count,
        copilotFeedback: copilotFeedback.count,
        encounters: encounters.count,
        consents: consents.count,
        legalAcceptances: legalAcceptances.count,
        refreshTokens: refreshTokens.count,
      };
    });

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
