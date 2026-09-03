import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { GuidelinesService } from '../../guidelines/guidelines.service';
import { maskPII } from '../../copilot/guardrails/pii-filter';
import { scanForInjection } from '../../copilot/guardrails/injection-defense';
import type { CreateAttachmentInput } from './schemas/attachments.schemas';

/**
 * F4 — Referência anexada pelo médico a UM atendimento.
 *
 * Origem: um médico do piloto viu um caso de dengue ser conduzido como sepse e
 * quis anexar a diretriz da ABRAMEDE àquele caso. Isso é deliberadamente
 * diferente de `POST /guidelines/suggest`: vale só para este atendimento, não
 * passa por curadoria e não afeta nenhum outro médico.
 *
 * Três propriedades que o resto do sistema depende:
 * 1. O anexo é UNTRUSTED. Passa por `scanForInjection` no upload e entra no
 *    prompt em bloco próprio, NUNCA dentro de `<guideline_evidence
 *    type="TRUSTED_CURATED_SOURCE">`.
 * 2. Persistimos o texto JÁ MASCARADO de PII, e nunca o arquivo original —
 *    minimização LGPD; depois da extração o binário não tem utilidade.
 * 3. Escopo por médico dono do encontro em toda operação (defesa contra IDOR,
 *    na linha do que a auditoria de segurança já apontou neste projeto).
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  /**
   * Máximo de anexos por atendimento. Não é limite de armazenamento: é limite
   * de CONTEXTO. Cada anexo entra inteiro no prompt (ver prompt-builder), e
   * empilhar referências dilui o caso clínico no meio de texto de diretriz.
   */
  static readonly MAX_ATTACHMENTS_PER_ENCOUNTER = 3;

  /**
   * Corte do texto que vai ao prompt. Um artigo inteiro de 47 páginas custaria
   * ~50k tokens por análise e afogaria o caso clínico; o médico é orientado a
   * recortar a seção que muda a conduta.
   */
  static readonly MAX_TEXT_CHARS = 20_000;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(GuidelinesService) private readonly guidelines: GuidelinesService,
  ) {}

  async list(physicianId: string, encounterId: string) {
    await this.assertOwnsEncounter(physicianId, encounterId);

    return this.prisma.encounterAttachment.findMany({
      where: { encounterId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(physicianId: string, encounterId: string, input: CreateAttachmentInput) {
    await this.assertOwnsEncounter(physicianId, encounterId);

    const existing = await this.prisma.encounterAttachment.count({ where: { encounterId } });
    if (existing >= AttachmentsService.MAX_ATTACHMENTS_PER_ENCOUNTER) {
      throw new BadRequestException(
        `Máximo de ${AttachmentsService.MAX_ATTACHMENTS_PER_ENCOUNTER} referências por atendimento. Remova uma antes de anexar outra.`,
      );
    }

    const extracted = await this.guidelines.extractDocumentText({
      mimeType: input.mimeType,
      data: input.data,
    });

    // O anexo é conteúdo não curado vindo de fora: mesma defesa aplicada ao
    // texto clínico digitado pelo médico (ver OrchestratorService.analyze).
    const injection = scanForInjection(extracted.text);
    if (!injection.safe) {
      await this.auditService
        .log({
          actorId: physicianId,
          action: 'PROMPT_INJECTION_DETECTED',
          entity: 'EncounterAttachment',
          entityId: encounterId,
          payload: {
            reasons: injection.reasons,
            confidence: injection.confidence,
            filename: input.filename,
            source: 'encounter_attachment',
          },
        })
        .catch(() => undefined);

      throw new BadRequestException(
        'O arquivo contém conteúdo que não pode ser enviado ao modelo. Envie apenas o trecho clínico da diretriz.',
      );
    }

    // LGPD-005 — o texto persistido já vai mascarado; o arquivo original nunca
    // é gravado.
    const redacted = maskPII(extracted.text);
    const text = redacted.redacted.slice(0, AttachmentsService.MAX_TEXT_CHARS);

    const attachment = await this.prisma.encounterAttachment.create({
      data: {
        encounterId,
        physicianId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        text,
      },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'ENCOUNTER_ATTACHMENT_ADDED',
        entity: 'EncounterAttachment',
        entityId: attachment.id,
        payload: {
          encounterId,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          extractedChars: extracted.text.length,
          storedChars: text.length,
          piiDetected: redacted.hasPII,
          pages: extracted.pages,
        },
      })
      .catch(() => undefined);

    this.logger.log(`Attachment ${attachment.id} added to encounter ${encounterId}`);

    return {
      ...attachment,
      truncated: extracted.truncated || extracted.text.length > AttachmentsService.MAX_TEXT_CHARS,
    };
  }

  async remove(physicianId: string, encounterId: string, attachmentId: string) {
    await this.assertOwnsEncounter(physicianId, encounterId);

    const attachment = await this.prisma.encounterAttachment.findFirst({
      where: { id: attachmentId, encounterId },
      select: { id: true, filename: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.prisma.encounterAttachment.delete({ where: { id: attachment.id } });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'ENCOUNTER_ATTACHMENT_REMOVED',
        entity: 'EncounterAttachment',
        entityId: attachment.id,
        payload: { encounterId, filename: attachment.filename },
      })
      .catch(() => undefined);

    return { removed: true as const };
  }

  /**
   * Texto dos anexos para o prompt, na ordem em que foram enviados.
   * Usado pelo orquestrador — ver `buildPhysicianAttachmentsBlock`.
   */
  async forPrompt(encounterId: string) {
    return this.prisma.encounterAttachment.findMany({
      where: { encounterId },
      select: { id: true, filename: true, text: true },
      orderBy: { createdAt: 'asc' },
      take: AttachmentsService.MAX_ATTACHMENTS_PER_ENCOUNTER,
    });
  }

  /**
   * Não confirma a existência de um atendimento de outro médico: encontro
   * inexistente e encontro alheio devolvem o mesmo 404.
   */
  private async assertOwnsEncounter(physicianId: string, encounterId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, physicianId },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
  }
}
