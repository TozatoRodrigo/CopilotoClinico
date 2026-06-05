import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
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
} as const;

/**
 * Computa hash SHA-256 de um objeto JSON com chaves ordenadas (canonical form).
 *
 * O uso de chaves ordenadas garante que dois objetos semanticamente iguais
 * mas com chaves em ordem diferente produzam o mesmo hash — essencial para
 * a trilha de auditoria médico-legal ser reproduzível.
 */
function canonicalHash(obj: unknown): string {
  const sorted = JSON.stringify(obj, Object.keys(obj as object).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
      select: { rawOutput: true },
    });

    if (!interaction) throw new NotFoundException('AI interaction not found');

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

    const contentHash = canonicalHash(content);

    const document = await this.prisma.document.create({
      data: { encounterId, physicianId, type: input.type, content, contentHash },
      select: DOCUMENT_SELECT,
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'DOCUMENT_GENERATED',
      entity: 'Document',
      entityId: document.id,
      payload: { encounterId, type: input.type, contentHash },
    }).catch(() => undefined);

    return document;
  }

  async edit(physicianId: string, documentId: string, input: EditDocumentInput) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { physicianId: true, confirmedBy: true },
    });

    if (!doc) throw new NotFoundException('Document not found');
    if (doc.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (doc.confirmedBy) throw new ForbiddenException('Confirmed documents cannot be edited');

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { physicianEdits: input.physicianEdits as unknown as Prisma.InputJsonObject },
      select: DOCUMENT_SELECT,
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'DOCUMENT_EDITED',
      entity: 'Document',
      entityId: documentId,
    }).catch(() => undefined);

    return updated;
  }

  /**
   * Confirma um documento gerado pela IA — gate de responsabilidade médico-legal.
   *
   * Qualquer médico autenticado pode confirmar (não apenas o autor), permitindo
   * cobertura de plantão. A confirmação:
   * 1. Recomputa o contentHash sobre o conteúdo efetivo no momento da confirmação
   *    (physicianEdits ?? content) com JSON canônico (chaves ordenadas).
   * 2. Registra confirmedBy, confirmedAt e o novo contentHash.
   * 3. Finaliza o encounter.
   * 4. Gera evento DOCUMENT_CONFIRMED na trilha de auditoria com afterHash e
   *    flag de incerteza da análise original.
   *
   * Retorna 409 ConflictException se o documento já foi confirmado.
   */
  async confirm(physicianId: string, documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        physicianId: true,
        confirmedBy: true,
        encounterId: true,
        content: true,
        physicianEdits: true,
      },
    });

    if (!doc) throw new NotFoundException('Document not found');

    // 409 — DoD: "impossível confirmar duas vezes"
    if (doc.confirmedBy) {
      throw new ConflictException('Document already confirmed');
    }

    // Hash canônico do conteúdo efetivo no momento da confirmação.
    // Se o médico editou, o hash reflete as edições — não o original da IA.
    const effectiveContent = doc.physicianEdits ?? doc.content;
    const contentHash = canonicalHash(effectiveContent);

    const now = new Date();
    const confirmed = await this.prisma.document.update({
      where: { id: documentId },
      data: { confirmedBy: physicianId, confirmedAt: now, contentHash },
      select: DOCUMENT_SELECT,
    });

    await this.prisma.encounter
      .update({ where: { id: doc.encounterId }, data: { status: 'finalized' } })
      .catch(() => {});

    // Buscar uncertainty da análise original para incluir na auditoria
    const recentInteraction = await this.prisma.aiInteraction.findFirst({
      where: { encounterId: doc.encounterId },
      orderBy: { createdAt: 'desc' },
      select: { uncertainty: true, uncertaintyReason: true },
    });

    // DOCUMENT_CONFIRMED = assunção de responsabilidade médico-legal.
    // afterHash = hash do conteúdo exato que foi confirmado (reproduzível).
    // uncertain=true no payload = médico confirmou com ciência da incerteza.
    await this.auditService.log({
      actorId: physicianId,
      action: 'DOCUMENT_CONFIRMED',
      entity: 'Document',
      entityId: documentId,
      afterHash: contentHash,
      payload: {
        encounterId: doc.encounterId,
        confirmedAt: now.toISOString(),
        authorPhysicianId: doc.physicianId,
        uncertain: recentInteraction?.uncertainty ?? false,
        uncertaintyReason: recentInteraction?.uncertaintyReason ?? null,
      },
    }).catch(() => undefined);

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
