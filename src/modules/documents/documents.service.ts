import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { GenerateDocumentInput, EditDocumentInput } from './schemas/document.schemas';
import { generateSOAP } from './generators/soap.generator';
import { generateSBAR } from './generators/sbar.generator';
import { generatePrescricao } from './generators/prescricao.generator';
import { generateAlta } from './generators/alta.generator';
import { generateAtestado } from './generators/atestado.generator';
import { buildDocumentPdf, type PdfDocumentInput } from './pdf/document-pdf.builder';
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

/**
 * Código curto e legível do documento (ex.: "SOAP-847B234F"), usado no PDF e
 * no nome do arquivo baixado — muito mais fácil de referenciar do que o UUID
 * completo, mantendo os 8 primeiros caracteres do id (únicos o bastante para
 * identificação humana; o UUID completo continua no hash/na auditoria).
 */
function shortDocumentCode(type: string, documentId: string): string {
  return `${type.toUpperCase()}-${documentId.slice(0, 8).toUpperCase()}`;
}

const PDF_DOCUMENT_SELECT = {
  id: true,
  physicianId: true,
  type: true,
  content: true,
  physicianEdits: true,
  confirmedBy: true,
  confirmedAt: true,
  encounterId: true,
  contentHash: true,
  physician: { select: { name: true, crmUf: true, crmNumber: true } },
} as const;

type DocumentForPdf = Prisma.DocumentGetPayload<{ select: typeof PDF_DOCUMENT_SELECT }>;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /**
   * PI-05 — DECISÃO DE PRODUTO (pendente de confirmação do Dr. Ripardo):
   * documentos gerados (SOAP/SBAR/prescrição/alta/atestado) permanecem
   * SEMPRE em português, independentemente do `physician.locale` da UI.
   * Motivo: são documentos com valor de prontuário médico no Brasil —
   * mudar seu idioma por preferência de exibição é uma questão regulatória,
   * não uma questão de UX, e não deve ser decidida unilateralmente aqui.
   * Por isso `generate()` abaixo NUNCA lê `physician.locale` — a ausência é
   * intencional, não um esquecimento. Revisitar se/quando essa decisão for
   * confirmada ou revertida.
   */
  /**
   * RD-E7 — idempotente por (encounterId, type): a tela Documento oferece
   * abas SOAP/SBAR/Prescrição/Alta/Atestado que chamam generate() livremente
   * ao trocar de aba; gerar de novo um tipo já existente para o mesmo
   * encontro retorna o documento existente (rascunho ou confirmado) em vez
   * de criar um duplicado. `aiInteractionId` também é opcional agora — sem
   * ele, usa a interação mais recente do encontro (mesmo fallback já usado
   * em confirm() para uncertainty).
   */
  async generate(physicianId: string, encounterId: string, input: GenerateDocumentInput) {
    const [encounter, physician] = await Promise.all([
      this.prisma.encounter.findUnique({
        where: { id: encounterId },
        select: { physicianId: true, patientRef: true },
      }),
      this.prisma.physician.findUnique({
        where: { id: physicianId },
        select: { crmVerified: true },
      }),
    ]);

    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.physicianId !== physicianId) throw new ForbiddenException('Access denied');

    const existing = await this.prisma.document.findFirst({
      where: { encounterId, type: input.type },
      orderBy: { createdAt: 'desc' },
      select: DOCUMENT_SELECT,
    });
    if (existing) return existing;

    const aiInteractionId =
      input.aiInteractionId ??
      (
        await this.prisma.aiInteraction.findFirst({
          where: { encounterId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      )?.id;

    if (!aiInteractionId) throw new NotFoundException('AI interaction not found');

    const interaction = await this.prisma.aiInteraction.findUnique({
      where: { id: aiInteractionId },
      select: { rawOutput: true },
    });

    if (!interaction) throw new NotFoundException('AI interaction not found');

    const copilotOutput = interaction.rawOutput as unknown as CopilotOutput;
    const caseText = copilotOutput.reasoning;

    const patientRef = encounter.patientRef ?? undefined;

    let content: Prisma.InputJsonValue;
    switch (input.type) {
      case 'soap':
        content = generateSOAP(caseText, copilotOutput) as unknown as Prisma.InputJsonObject;
        break;
      case 'sbar':
        content = generateSBAR(caseText, copilotOutput) as unknown as Prisma.InputJsonObject;
        break;
      case 'prescricao':
        content = generatePrescricao(
          caseText,
          copilotOutput,
          patientRef,
        ) as unknown as Prisma.InputJsonObject;
        break;
      case 'alta':
        content = generateAlta(
          caseText,
          copilotOutput,
          patientRef,
        ) as unknown as Prisma.InputJsonObject;
        break;
      case 'atestado':
        content = generateAtestado(
          caseText,
          copilotOutput,
          patientRef,
        ) as unknown as Prisma.InputJsonObject;
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

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'DOCUMENT_GENERATED',
        entity: 'Document',
        entityId: document.id,
        payload: {
          encounterId,
          type: input.type,
          contentHash,
          // IAM-001: registrar estado de verificação no momento da geração.
          // Permite auditoria regulatória: "documento gerado com CRM não verificado".
          crmVerifiedAtGeneration: physician?.crmVerified ?? false,
        },
      })
      .catch(() => undefined);

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

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'DOCUMENT_EDITED',
        entity: 'Document',
        entityId: documentId,
      })
      .catch(() => undefined);

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
        type: true,
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
    await this.auditService
      .log({
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
      })
      .catch(() => undefined);

    // Upload PDF to storage (non-blocking, graceful degradation)
    setImmediate(() => {
      this.uploadDocumentPdf(confirmed.id, doc.encounterId).catch((err) =>
        this.logger.error(`PDF upload failed for document ${confirmed.id}`, err),
      );
    });

    return confirmed;
  }

  private async uploadDocumentPdf(documentId: string, encounterId: string): Promise<void> {
    if (!this.storage.isAvailable()) return;
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: PDF_DOCUMENT_SELECT,
    });
    if (!doc || !doc.confirmedBy || !doc.confirmedAt) return;

    const pdfBuffer = await buildDocumentPdf(
      this.toPdfInput(doc as DocumentForPdf & { confirmedAt: Date }),
    );
    const key = `documents/${encounterId}/${documentId}.pdf`;
    await this.storage.upload(key, pdfBuffer, 'application/pdf');
    await this.prisma.document.update({
      where: { id: documentId },
      data: { pdfObjectKey: key },
    });
    this.logger.log(`PDF stored: ${key}`);
  }

  async getDownloadUrl(physicianId: string, documentId: string): Promise<string | null> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { physicianId: true, pdfObjectKey: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (!doc.pdfObjectKey) return null;
    return this.storage.getPresignedUrl(doc.pdfObjectKey);
  }

  /**
   * Gera o PDF do documento sob demanda, sem depender do object storage.
   *
   * O upload para o MinIO após confirm() é best-effort (falha silenciosa quando
   * `storage.isAvailable()` é false, ex.: MinIO não provisionado em produção).
   * Quando não há `pdfObjectKey`, este método reconstrói o PDF diretamente do
   * conteúdo persistido no banco — mesma renderização usada no upload (layout,
   * tipografia e cores da identidade visual do app) — para que o download nunca
   * resulte em 404 apenas por o storage estar indisponível.
   *
   * Retorna null quando o documento ainda não foi confirmado/assinado
   * (não existe "PDF assinado" para um documento em rascunho).
   */
  async getDownloadPdf(
    physicianId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; filename: string } | null> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: PDF_DOCUMENT_SELECT,
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (!doc.confirmedBy || !doc.confirmedAt) return null;

    const confirmed = doc as DocumentForPdf & { confirmedAt: Date };
    const buffer = await buildDocumentPdf(this.toPdfInput(confirmed));
    const dateStr = confirmed.confirmedAt.toISOString().slice(0, 10);
    const filename = `${doc.type}-${documentId.slice(0, 8)}_${dateStr}.pdf`;

    return { buffer, filename };
  }

  private toPdfInput(doc: DocumentForPdf & { confirmedAt: Date }): PdfDocumentInput {
    const effectiveContent = (doc.physicianEdits ?? doc.content) as Record<string, unknown>;
    return {
      type: doc.type,
      content: effectiveContent,
      confirmedAt: doc.confirmedAt,
      documentCode: shortDocumentCode(doc.type, doc.id),
      physicianName: doc.physician.name?.trim() || 'Médico não identificado',
      crmLabel:
        doc.physician.crmUf && doc.physician.crmNumber
          ? `${doc.physician.crmUf}-${doc.physician.crmNumber}`
          : null,
      encounterCode: doc.encounterId.slice(0, 12),
      contentHash: doc.contentHash,
    };
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
