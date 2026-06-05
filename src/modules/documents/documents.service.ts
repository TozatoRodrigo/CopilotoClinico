import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GenerateDocumentInput, EditDocumentInput } from './schemas/document.schemas';
import { generateSOAP } from './generators/soap.generator';
import { generateSBAR } from './generators/sbar.generator';
import type { CopilotOutput } from '../copilot/guardrails/output-validator';

const DOCUMENT_SELECT = {
  id: true,
  encounterId: true,
  type: true,
  content: true,
  physicianEdits: true,
  confirmedBy: true,
  confirmedAt: true,
  contentHash: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generate(physicianId: string, encounterId: string, input: GenerateDocumentInput) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { physicianId: true, patientRef: true },
    });

    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.physicianId !== physicianId) throw new ForbiddenException('Access denied');

    const interaction = await this.prisma.aiInteraction.findUnique({
      where: { id: input.aiInteractionId },
      select: { encounterId: true, rawOutput: true },
    });

    if (!interaction) throw new NotFoundException('AI interaction not found');
    if (interaction.encounterId !== encounterId) {
      throw new ForbiddenException('AI interaction does not belong to encounter');
    }

    const copilotOutput = interaction.rawOutput as unknown as CopilotOutput;
    const caseText = copilotOutput.reasoning;

    let content: Prisma.InputJsonValue;
    switch (input.type) {
      case 'soap':
        content = generateSOAP(caseText, copilotOutput) as unknown as Prisma.InputJsonObject;
        break;
      case 'sbar':
        content = generateSBAR(caseText, copilotOutput) as unknown as Prisma.InputJsonObject;
        break;
      default:
        content = {
          source: caseText,
          recommendations: copilotOutput.recommendations,
        } as unknown as Prisma.InputJsonObject;
    }

    const contentStr = JSON.stringify(content);
    const contentHash = createHash('sha256').update(contentStr).digest('hex');

    return this.prisma.document.create({
      data: {
        encounterId,
        physicianId,
        type: input.type,
        content,
        contentHash,
      },
      select: DOCUMENT_SELECT,
    });
  }

  async edit(physicianId: string, documentId: string, input: EditDocumentInput) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { physicianId: true, confirmedBy: true, content: true },
    });

    if (!doc) throw new NotFoundException('Document not found');
    if (doc.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (doc.confirmedBy) throw new ForbiddenException('Confirmed documents cannot be edited');

    const effectiveContent = input.physicianEdits;
    const contentHash = createHash('sha256').update(JSON.stringify(effectiveContent)).digest('hex');

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        physicianEdits: effectiveContent as unknown as Prisma.InputJsonObject,
        contentHash,
      },
      select: DOCUMENT_SELECT,
    });
  }

  async confirm(physicianId: string, documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        physicianId: true,
        confirmedBy: true,
        encounterId: true,
        contentHash: true,
      },
    });

    if (!doc) throw new NotFoundException('Document not found');
    if (doc.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (doc.confirmedBy) throw new BadRequestException('Document already confirmed');

    const now = new Date();
    const confirmed = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        confirmedBy: physicianId,
        confirmedAt: now,
      },
      select: DOCUMENT_SELECT,
    });

    await this.prisma.encounter
      .update({
        where: { id: doc.encounterId },
        data: { status: 'finalized' },
      })
      .catch(() => {});

    await this.audit.log({
      actorId: physicianId,
      action: 'DOCUMENT_CONFIRMED',
      entity: 'document',
      entityId: documentId,
      payload: {
        encounterId: doc.encounterId,
        contentHash: doc.contentHash,
        confirmedAt: now.toISOString(),
      },
    });

    return confirmed;
  }

  async findByEncounter(physicianId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { physicianId: true },
    });

    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.physicianId !== physicianId) throw new ForbiddenException('Access denied');

    return this.prisma.document.findMany({
      where: { encounterId },
      orderBy: { createdAt: 'desc' },
      select: DOCUMENT_SELECT,
    });
  }
}
