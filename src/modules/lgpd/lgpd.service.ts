import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import type {
  Physician,
  Consent,
  Encounter,
  Document as DocumentRecord,
  AiInteraction,
  AuditLog,
  RefreshToken,
} from '@prisma/client';

export interface PhysicianDataExport {
  physician: Omit<Physician, 'passwordHash' | 'mfaSecret'>;
  encounters: Encounter[];
  documents: DocumentRecord[];
  aiInteractions: AiInteraction[];
  consents: Consent[];
  auditLog: AuditLog[];
  refreshTokens: RefreshToken[];
}

@Injectable()
export class LgpdService {
  constructor(private readonly prisma: PrismaService) {}

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
        mfaEnabled: true,
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

    const [documents, consents, auditLog, refreshTokens, aiInteractions] = await Promise.all([
      this.prisma.document.findMany({ where: { physicianId } }),
      this.prisma.consent.findMany({ where: { physicianId } }),
      this.prisma.auditLog.findMany({ where: { actorId: physicianId } }),
      this.prisma.refreshToken.findMany({ where: { physicianId } }),
      encounterIds.length > 0
        ? this.prisma.aiInteraction.findMany({
            where: { encounterId: { in: encounterIds } },
          })
        : Promise.resolve([]),
    ]);

    return {
      physician,
      encounters,
      documents,
      aiInteractions,
      consents,
      auditLog,
      refreshTokens,
    };
  }

  async requestErasure(physicianId: string): Promise<{
    status: string;
    estimatedCompletion: Date;
  }> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
    });

    if (!physician) {
      throw new NotFoundException('Physician not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.encounter.deleteMany({ where: { physicianId } });
      await tx.consent.deleteMany({ where: { physicianId } });
      await tx.refreshToken.deleteMany({ where: { physicianId } });

      await tx.physician.update({
        where: { id: physicianId },
        data: {
          name: 'ERASED',
          email: `erased-${physicianId}@erased.com`,
          mfaSecret: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: physicianId,
          action: 'DATA_ERASURE',
          entity: 'Physician',
          entityId: physicianId,
          payload: { reason: 'LGPD Art. 18, VI - Data erasure request' },
        },
      });
    });

    return { status: 'completed', estimatedCompletion: new Date() };
  }
}
