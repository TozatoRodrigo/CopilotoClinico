import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateEncounterInput, UpdateEncounterInput } from './schemas/encounter.schemas';

@Injectable()
export class EncountersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(physicianId: string, input: CreateEncounterInput) {
    return this.prisma.encounter.create({
      data: {
        physicianId,
        patientRef: input.patientRef,
        vertical: input.vertical,
        context: input.context,
        status: 'draft',
      },
      select: {
        id: true,
        physicianId: true,
        vertical: true,
        context: true,
        patientRef: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(physicianId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: {
        id: true,
        physicianId: true,
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

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    if (encounter.physicianId !== physicianId) {
      throw new ForbiddenException('Access denied');
    }

    return encounter;
  }

  async findByPhysician(physicianId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [encounters, total] = await Promise.all([
      this.prisma.encounter.findMany({
        where: { physicianId },
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
      this.prisma.encounter.count({ where: { physicianId } }),
    ]);

    return { data: encounters, meta: { page, limit, total } };
  }

  async update(physicianId: string, encounterId: string, input: UpdateEncounterInput) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { physicianId: true, status: true },
    });

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    if (encounter.physicianId !== physicianId) {
      throw new ForbiddenException('Access denied');
    }

    if (encounter.status === 'finalized' && input.status !== 'cancelled') {
      throw new ForbiddenException('Finalized encounters cannot be updated');
    }

    return this.prisma.encounter.update({
      where: { id: encounterId },
      data: input,
      select: {
        id: true,
        physicianId: true,
        vertical: true,
        context: true,
        patientRef: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
