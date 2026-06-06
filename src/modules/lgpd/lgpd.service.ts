import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  Physician,
  Consent,
  Encounter,
  Document as DocumentRecord,
  AiInteraction,
  AuditLog,
} from '@prisma/client';

export interface PhysicianDataExport {
  exportVersion: 'lgpd-portability-v1';
  generatedAt: string;
  dataSubject: {
    type: 'physician';
    id: string;
  };
  data: {
    physician: Omit<Physician, 'passwordHash'>;
    encounters: Encounter[];
    documents: DocumentRecord[];
    aiInteractions: AiInteraction[];
    consents: Consent[];
    auditLog: AuditLog[];
  };
}

@Injectable()
export class LgpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async grantConsent(physicianId: string, scope: string): Promise<Consent> {
    return this.prisma.consent.create({
      data: { physicianId, scope },
    });
  }

  async revokeConsent(physicianId: string, scope: string): Promise<Consent> {
    const consent = await this.prisma.consent.findFirst({
      where: { physicianId, scope, revokedAt: null },
    });

    if (!consent) {
      throw new NotFoundException('Active consent not found');
    }

    return this.prisma.consent.update({
      where: { id: consent.id },
      data: { revokedAt: new Date() },
    });
  }

  async checkConsent(physicianId: string, scope: string): Promise<boolean> {
    const consent = await this.prisma.consent.findFirst({
      where: { physicianId, scope, revokedAt: null },
    });
    return consent !== null;
  }

  async exportPhysicianData(physicianId: string): Promise<PhysicianDataExport> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: {
        id: true,
        crmUf: true,
        crmNumber: true,
        email: true,
        name: true,
        crmVerified: true,
        subscriptionStatus: true,
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

    const [documents, consents, auditLog, aiInteractions] = await Promise.all([
      this.prisma.document.findMany({ where: { physicianId } }),
      this.prisma.consent.findMany({ where: { physicianId } }),
      this.prisma.auditLog.findMany({ where: { actorId: physicianId } }),
      encounterIds.length > 0
        ? this.prisma.aiInteraction.findMany({
            where: { encounterId: { in: encounterIds } },
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
        documents,
        aiInteractions,
        consents,
        auditLog,
      },
    };
  }

  async requestErasure(physicianId: string): Promise<{
    status: string;
    estimatedCompletion: Date;
    erased: {
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
        consents: consents.count,
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
