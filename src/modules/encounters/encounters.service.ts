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
  chiefComplaint: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

// PI-01 — mesmo ranking usado na análise clínica (prompt-builder.ts /
// RED FLAGS RULE): critical > high > moderate.
const RED_FLAG_SEVERITY_RANK: Record<string, number> = { critical: 3, high: 2, moderate: 1 };
type RedFlagSeverity = 'critical' | 'high' | 'moderate';

interface LatestInteractionSummary {
  severity: RedFlagSeverity | null;
  lastInteractionAt: Date;
}

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
        chiefComplaint: true,
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
          chiefComplaint: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.encounter.count({ where }),
    ]);

    // PI-01 — UMA query extra em lote para a página inteira (não uma por
    // encontro): evita N+1 mesmo sem denormalizar a severidade numa coluna
    // do Encounter. Em escala de piloto (dezenas de casos por página) isto
    // é preferível a uma migração; se o volume crescer muito, denormalizar
    // num campo atualizado a cada análise (ver orchestrator.service.ts)
    // vira a escolha certa — documentado aqui para retomar a decisão.
    const latestInteractionByEncounter = await this.getLatestInteractionSummaries(
      encounters.map((e) => e.id),
    );

    const data = encounters.map((encounter) => {
      const latest = latestInteractionByEncounter.get(encounter.id);
      return {
        ...encounter,
        highestRedFlagSeverity: latest?.severity ?? null,
        lastInteractionAt: latest?.lastInteractionAt.toISOString() ?? null,
      };
    });

    return { data, meta: { page, limit, total } };
  }

  /**
   * PI-01 — para cada encontro, a severidade de red flag da interação de
   * IA MAIS RECENTE (não o máximo histórico — reflete o estado clínico
   * atual; um achado crítico do turno 1 já reavaliado no turno 3 não deve
   * continuar sinalizando alerta). `rawOutput` é `Prisma.JsonValue` sem
   * schema garantido em runtime (ver mesmo cuidado em sbar.generator.ts),
   * daí a leitura defensiva abaixo.
   */
  private async getLatestInteractionSummaries(
    encounterIds: string[],
  ): Promise<Map<string, LatestInteractionSummary>> {
    if (encounterIds.length === 0) return new Map();

    const interactions = await this.prisma.aiInteraction.findMany({
      where: { encounterId: { in: encounterIds } },
      orderBy: { createdAt: 'desc' },
      select: { encounterId: true, rawOutput: true, createdAt: true },
    });

    const result = new Map<string, LatestInteractionSummary>();
    for (const interaction of interactions) {
      // orderBy desc — a primeira ocorrência de cada encounterId já é a mais recente.
      if (result.has(interaction.encounterId)) continue;

      const rawOutput = interaction.rawOutput as unknown as {
        redFlags?: Array<{ severity?: string }>;
      } | null;
      const redFlags = Array.isArray(rawOutput?.redFlags) ? rawOutput!.redFlags : [];

      let highest: RedFlagSeverity | null = null;
      for (const flag of redFlags) {
        const rank = RED_FLAG_SEVERITY_RANK[flag.severity ?? ''] ?? 0;
        const currentRank = highest ? RED_FLAG_SEVERITY_RANK[highest]! : 0;
        if (rank > currentRank) highest = flag.severity as RedFlagSeverity;
      }

      result.set(interaction.encounterId, {
        severity: highest,
        lastInteractionAt: interaction.createdAt,
      });
    }
    return result;
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

  /**
   * RD-E7 — atualização interna, chamada só pelo OrchestratorService após a
   * 1ª análise de IA (analyze/analyzeStream). Deliberadamente separada de
   * update(): chiefComplaint NÃO faz parte de updateEncounterSchema, então
   * não é alcançável pelo endpoint público PATCH /encounters/:id — é sempre
   * derivado da análise, nunca digitado pelo médico.
   */
  async updateChiefComplaint(encounterId: string, chiefComplaint: string | null): Promise<void> {
    await this.prisma.encounter.update({
      where: { id: encounterId },
      data: { chiefComplaint },
      select: { id: true },
    });
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
