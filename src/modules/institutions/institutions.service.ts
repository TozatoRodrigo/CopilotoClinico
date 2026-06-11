import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInstitutionInput } from './schemas/institutions.schemas';

@Injectable()
export class InstitutionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async create(input: CreateInstitutionInput) {
    const institution = await this.prisma.institution.create({
      data: {
        name: input.name,
        cnes: input.cnes ?? null,
        status: input.status,
      },
    });

    await this.auditService
      .log({
        actorId: 'system',
        action: 'INSTITUTION_CREATED',
        entity: 'Institution',
        entityId: institution.id,
        payload: { name: institution.name, cnes: institution.cnes },
      })
      .catch(() => undefined);

    return institution;
  }

  async findAll() {
    return this.prisma.institution.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Vincula um médico a uma instituição (idempotente). Plantonista pode
   * pertencer a N instituições — não há restrição de cardinalidade aqui.
   */
  async linkPhysician(institutionId: string, physicianId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) throw new NotFoundException('Institution not found');

    const physician = await this.prisma.physician.findUnique({ where: { id: physicianId } });
    if (!physician) throw new NotFoundException('Physician not found');

    const link = await this.prisma.physicianInstitution.upsert({
      where: { physicianId_institutionId: { physicianId, institutionId } },
      create: { physicianId, institutionId },
      update: {},
    });

    await this.auditService
      .log({
        actorId: 'system',
        action: 'PHYSICIAN_LINKED_TO_INSTITUTION',
        entity: 'PhysicianInstitution',
        entityId: link.id,
        payload: { physicianId, institutionId },
      })
      .catch(() => undefined);

    return link;
  }

  async listForPhysician(physicianId: string) {
    const links = await this.prisma.physicianInstitution.findMany({
      where: { physicianId },
      include: { institution: true },
      orderBy: { createdAt: 'asc' },
    });

    return links.map((link) => link.institution);
  }
}
