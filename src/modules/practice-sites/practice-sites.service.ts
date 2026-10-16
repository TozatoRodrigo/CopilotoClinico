import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  FACILITY_TYPES,
  PRACTICE_SITE_LIMITS,
  SITE_SPECIALISTS,
  type FacilityType,
  type PracticeSite,
  type PracticeSiteInput,
  type SiteSpecialist,
} from '../../shared/contracts/practice-site';

const SITE_SELECT = {
  id: true,
  name: true,
  facilityType: true,
  hasCT: true,
  hasLab: true,
  hasICU: true,
  isSus: true,
  specialists: true,
  referenceTravelMinutes: true,
  referenceDistanceKm: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PracticeSiteSelect;

type SiteRecord = Prisma.PracticeSiteGetPayload<{ select: typeof SITE_SELECT }>;

const facilityTypeSchema = z.enum(FACILITY_TYPES);
const specialistSchema = z.enum(SITE_SPECIALISTS);

/**
 * As colunas são texto (validado na entrada, não pelo banco). Um valor que
 * saiu da lista depois de gravado vira "outro" ou some, em vez de quebrar a
 * tela de configurações e o caso novo.
 */
function toPracticeSite(record: SiteRecord): PracticeSite {
  const facilityType: FacilityType = facilityTypeSchema.catch('outro').parse(record.facilityType);
  const specialists = record.specialists.flatMap((value): SiteSpecialist[] => {
    const parsed = specialistSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    ...record,
    facilityType,
    specialists,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * CC-602 — locais de plantão do médico. Toda operação é escopada pelo médico
 * do token: local de outro médico e local inexistente devolvem o mesmo 404.
 *
 * Sempre há um padrão quando há local: o primeiro salvo vira padrão, marcar
 * outro move o padrão, e apagar o padrão promove o local mais antigo. O índice
 * único parcial da migration segura a regra no banco.
 */
@Injectable()
export class PracticeSitesService {
  private readonly logger = new Logger(PracticeSitesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async list(physicianId: string): Promise<PracticeSite[]> {
    const records = await this.prisma.practiceSite.findMany({
      where: { physicianId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: SITE_SELECT,
    });
    return records.map(toPracticeSite);
  }

  async create(physicianId: string, input: PracticeSiteInput): Promise<PracticeSite> {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.practiceSite.count({ where: { physicianId } });
      if (existing >= PRACTICE_SITE_LIMITS.sitesPerPhysician) {
        throw new BadRequestException(
          `Limite de ${PRACTICE_SITE_LIMITS.sitesPerPhysician} locais de plantão atingido`,
        );
      }
      const isDefault = input.isDefault || existing === 0;
      if (isDefault) await this.clearDefault(tx, physicianId);
      return tx.practiceSite.create({
        data: { ...input, physicianId, isDefault },
        select: SITE_SELECT,
      });
    });

    await this.record(physicianId, 'PRACTICE_SITE_CREATED', record);
    return toPracticeSite(record);
  }

  async update(
    physicianId: string,
    siteId: string,
    input: PracticeSiteInput,
  ): Promise<PracticeSite> {
    const record = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOwned(tx, physicianId, siteId);
      // Desmarcar o padrão não o tira: o caso novo ficaria sem local. O
      // padrão muda quando outro local é marcado.
      const isDefault = input.isDefault || current.isDefault;
      if (isDefault && !current.isDefault) await this.clearDefault(tx, physicianId);
      return tx.practiceSite.update({
        where: { id: current.id },
        data: { ...input, isDefault },
        select: SITE_SELECT,
      });
    });

    await this.record(physicianId, 'PRACTICE_SITE_UPDATED', record);
    return toPracticeSite(record);
  }

  async remove(physicianId: string, siteId: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOwned(tx, physicianId, siteId);
      await tx.practiceSite.delete({ where: { id: current.id } });
      if (current.isDefault) {
        const next = await tx.practiceSite.findFirst({
          where: { physicianId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.practiceSite.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
      return current;
    });

    await this.record(physicianId, 'PRACTICE_SITE_DELETED', removed);
  }

  private async findOwned(
    tx: Prisma.TransactionClient,
    physicianId: string,
    siteId: string,
  ): Promise<SiteRecord> {
    const site = await tx.practiceSite.findFirst({
      where: { id: siteId, physicianId },
      select: SITE_SELECT,
    });
    if (!site) throw new NotFoundException('Local de plantão não encontrado');
    return site;
  }

  private async clearDefault(tx: Prisma.TransactionClient, physicianId: string): Promise<void> {
    await tx.practiceSite.updateMany({
      where: { physicianId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /**
   * Trilha de auditoria e log sem o nome do local (texto livre): o id, o
   * porte e se é o padrão bastam para reconstruir o que mudou.
   */
  private async record(
    physicianId: string,
    action: 'PRACTICE_SITE_CREATED' | 'PRACTICE_SITE_UPDATED' | 'PRACTICE_SITE_DELETED',
    site: Pick<SiteRecord, 'id' | 'facilityType' | 'isDefault'>,
  ): Promise<void> {
    this.logger.log(
      `${action} siteId=${site.id} facilityType=${site.facilityType} default=${site.isDefault}`,
    );
    await this.auditService
      .log({
        actorId: physicianId,
        action,
        entity: 'PracticeSite',
        entityId: site.id,
        payload: { facilityType: site.facilityType, isDefault: site.isDefault },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `PRACTICE_SITE_AUDIT_FAILED siteId=${site.id}: ${error instanceof Error ? error.name : 'erro'}`,
        );
      });
  }
}
