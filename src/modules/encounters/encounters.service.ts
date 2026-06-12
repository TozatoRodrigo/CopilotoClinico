import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InstitutionsService } from '../institutions/institutions.service';
import {
  CreateEncounterInput,
  UpdateEncounterInput,
  ListEncountersQuery,
} from './schemas/encounter.schemas';

const ENCOUNTER_SELECT = {
  id: true,
  physicianId: true,
  institutionId: true,
  vertical: true,
  context: true,
  patientRef: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class EncountersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(InstitutionsService) private readonly institutionsService: InstitutionsService,
  ) {}

  async create(physicianId: string, input: CreateEncounterInput) {
    const institutionId = await this.resolveInstitutionId(physicianId, input.institutionId);

    const encounter = await this.prisma.encounter.create({
      data: {
        physicianId,
        institutionId,
        patientRef: input.patientRef,
        vertical: input.vertical,
        context: input.context,
        status: 'draft',
      },
      select: ENCOUNTER_SELECT,
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'ENCOUNTER_CREATED',
        entity: 'Encounter',
        entityId: encounter.id,
        payload: { vertical: encounter.vertical, institutionId: encounter.institutionId },
      })
      .catch(() => undefined);

    return encounter;
  }

  /**
   * PROT-004: resolve a instituição do atendimento.
   * - Se informada explicitamente, o médico precisa pertencer a ela.
   * - Caso contrário, usa a instituição única do médico (default), ou
   *   permanece global (null) se ele não tiver vínculo ou tiver mais de um.
   */
  private async resolveInstitutionId(
    physicianId: string,
    requestedInstitutionId?: string,
  ): Promise<string | null> {
    const institutions = await this.institutionsService.listForPhysician(physicianId);

    if (requestedInstitutionId) {
      const belongs = institutions.some((i) => i.id === requestedInstitutionId);
      if (!belongs) {
        throw new ForbiddenException('Médico não pertence à instituição informada');
      }
      return requestedInstitutionId;
    }

    return institutions.length === 1 ? institutions[0]!.id : null;
  }

  async findById(physicianId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: {
        id: true,
        physicianId: true,
        institutionId: true,
        vertical: true,
        context: true,
        patientRef: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        aiInteractions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            model: true,
            uncertainty: true,
            uncertaintyReason: true,
            latencyMs: true,
            cost: true,
            createdAt: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            confirmedBy: true,
            confirmedAt: true,
            contentHash: true,
            createdAt: true,
          },
        },
      },
    });

    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.physicianId !== physicianId) throw new ForbiddenException('Access denied');

    return encounter;
  }

  async findByPhysician(physicianId: string, query: ListEncountersQuery) {
    const { page, limit, status, vertical, search, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { physicianId };

    if (status) {
      where.status = status;
    }

    if (vertical) {
      where.vertical = vertical;
    }

    if (search) {
      where.patientRef = { contains: search, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
      where.createdAt = createdAt;
    }

    const [encounters, total] = await Promise.all([
      this.prisma.encounter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          vertical: true,
          patientRef: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return { data: encounters, meta: { page, limit, total } };
  }

  async update(physicianId: string, encounterId: string, input: UpdateEncounterInput) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { physicianId: true, status: true },
    });

    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (encounter.status === 'finalized' && input.status !== 'cancelled') {
      throw new ForbiddenException('Finalized encounters cannot be updated');
    }

    const updated = await this.prisma.encounter.update({
      where: { id: encounterId },
      data: input,
      select: ENCOUNTER_SELECT,
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'ENCOUNTER_UPDATED',
        entity: 'Encounter',
        entityId: encounterId,
        payload: { previousStatus: encounter.status, newStatus: updated.status },
      })
      .catch(() => undefined);

    return updated;
  }

  async getDashboardStats(physicianId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayCount, pendingReviews, confirmedDocuments] = await Promise.all([
      this.prisma.encounter.count({
        where: { physicianId, createdAt: { gte: todayStart } },
      }),
      this.prisma.encounter.count({
        where: { physicianId, status: 'in_review' },
      }),
      this.prisma.document.count({
        where: { physicianId, confirmedBy: { not: null } },
      }),
    ]);

    return { todayCount, pendingReviews, confirmedDocuments };
  }
}
