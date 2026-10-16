import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhysicianErasureCheck } from '../auth/physician-erasure-check.service';
import { StorageService } from '../storage/storage.service';
import { AiConsentRevokedException } from './ai-consent.exception';
import { consentDefaults, consentScopes, type ConsentScope } from './schemas/lgpd.schemas';
import type {
  Prisma,
  Physician,
  Consent,
  LegalDocument,
  Encounter,
  EncounterAttachment,
  Document as DocumentRecord,
  AiInteraction,
  CaseIntake,
  AuditLog,
  RecommendationDecision,
  CopilotFeedback,
  PracticeSite,
  KnowledgeGap,
  MentoringRequest,
  ShiftReview,
  ShiftReviewQuestion,
  ExternalIdentity,
} from '@prisma/client';
import type { BetaParticipant, BetaWaitlistEntry } from '@prisma/client';

type BetaParticipantExport = Omit<BetaParticipant, 'id' | 'inviteId'> & {
  invite: { batchLabel: string };
};

/**
 * Captura de áudio na exportação: metadados e transcrição (já mascarada de
 * PII). `encryptedContent` fica de fora: é o áudio bruto cifrado com a chave do
 * servidor, inútil para o titular, e decifrá-lo poria a voz do paciente, sem
 * máscara, num JSON baixado pelo navegador. Allowlist em vez de `omit`: coluna
 * nova em `audio_captures` só entra na exportação se for listada aqui.
 */
const EXPORTED_AUDIO_CAPTURE_SELECT = {
  id: true,
  encounterId: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  transcribedText: true,
  retainUntil: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AudioCaptureSelect;

export type ExportedAudioCapture = Prisma.AudioCaptureGetPayload<{
  select: typeof EXPORTED_AUDIO_CAPTURE_SELECT;
}>;

export interface PhysicianDataExport {
  exportVersion: 'lgpd-portability-v1';
  generatedAt: string;
  dataSubject: {
    type: 'physician';
    id: string;
  };
  data: {
    // CC-018 — erasedAt fica de fora: é sempre null para quem ainda consegue
    // pedir a exportação (o cadastro eliminado não tem mais sessão).
    physician: Omit<Physician, 'passwordHash' | 'mfaSecret' | 'mfaEnabled' | 'erasedAt'>;
    /**
     * CC-702 — o beta: de qual lote de convite a conta veio, o aceite do termo
     * e o perfil; e a entrada da lista de espera com o mesmo e-mail.
     */
    beta: {
      participant: BetaParticipantExport | null;
      waitlist: BetaWaitlistEntry[];
    };
    encounters: Encounter[];
    /**
     * O arquivo original nunca é gravado (LGPD-005, ver AttachmentsService):
     * o texto extraído e mascarado é todo o conteúdo que guardamos, então vai
     * inline — não há objeto no storage para referenciar.
     */
    encounterAttachments: EncounterAttachment[];
    documents: DocumentRecord[];
    aiInteractions: AiInteraction[];
    /** ADR-014 — conversas antes do plano (caso e respostas já redigidos). */
    caseIntakes: CaseIntake[];
    /** F0-D — Adotar/Rejeitar/Anotar por recomendação (notas já mascaradas). */
    recommendationDecisions: RecommendationDecision[];
    /** F0-D — reportes do médico sobre análises (comentário já mascarado). */
    copilotFeedback: CopilotFeedback[];
    /** Capturas de áudio, inclusive as com o áudio já eliminado (`status: deleted`). */
    audioCaptures: ExportedAudioCapture[];
    /** CC-602 — locais onde o médico dá plantão. */
    practiceSites: PracticeSite[];
    /**
     * CC-703 — "não encontrei o que precisava" nas análises do médico (nota
     * já mascarada). Sem coluna de médico: sai pelas análises dele, e a
     * eliminação o leva junto, por cascata, com os atendimentos.
     */
    knowledgeGaps: KnowledgeGap[];
    /**
     * CC-707 — pedidos de mentoria que o médico fez e os que respondeu como
     * mentor (caso, dúvida e resposta já mascarados).
     */
    mentoringRequests: MentoringRequest[];
    /** CC-801 — revisões do plantão com as perguntas, respostas e grau de certeza. */
    shiftReviews: Array<ShiftReview & { questions: ShiftReviewQuestion[] }>;
    /** CC-334 — contas Google/Microsoft vinculadas (e-mail no momento do vínculo). */
    externalIdentities: Pick<
      ExternalIdentity,
      'provider' | 'subject' | 'emailAtLink' | 'createdAt' | 'lastLoginAt'
    >[];
    consents: Consent[];
    /** CC-905 — versões dos termos e da política que o médico aceitou, e quando. */
    legalAcceptances: Array<{
      acceptedAt: Date;
      document: Pick<
        LegalDocument,
        'type' | 'version' | 'contentHash' | 'provisional' | 'publishedAt'
      >;
    }>;
    auditLog: AuditLog[];
  };
}

export interface ErasureResult {
  status: 'completed';
  estimatedCompletion: Date;
  erased: {
    /** CC-702 — entradas da lista de espera com o e-mail da conta. */
    betaWaitlistEntries: number;
    /** CC-702 — participação no beta com termo e perfil apagados (ficam os ids). */
    betaParticipantProfile: number;
    recommendationDecisions: number;
    copilotFeedback: number;
    /** CC-707 — pedidos de mentoria que o médico fez. */
    mentoringRequests: number;
    /** CC-801 — perguntas e revisões do plantão. */
    shiftReviewQuestions: number;
    shiftReviews: number;
    encounters: number;
    encounterAttachments: number;
    audioCaptures: number;
    /** CC-602 — locais de plantão do médico. */
    practiceSites: number;
    consents: number;
    /** CC-905 — aceites dos termos e da política. */
    legalAcceptances: number;
    refreshTokens: number;
    /** CC-334 — contas Google/Microsoft vinculadas. */
    externalIdentities: number;
    /** PDFs de documentos confirmados apagados do MinIO. */
    storageObjects: number;
  };
}

export interface ConsentScopeStatus {
  scope: ConsentScope;
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PhysicianErasureCheck) private readonly erasureCheck: PhysicianErasureCheck,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async grantConsent(physicianId: string, scope: string): Promise<Consent> {
    const consentScope = this.parseConsentScope(scope);
    const activeConsent = await this.prisma.consent.findFirst({
      where: { physicianId, scope: consentScope, revokedAt: null },
    });

    if (activeConsent) {
      return activeConsent;
    }

    const consent = await this.prisma.consent.create({
      data: { physicianId, scope: consentScope },
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'CONSENT_GRANTED',
      entity: 'Consent',
      entityId: consent.id,
      payload: { scope: consentScope },
    });

    return consent;
  }

  async listConsentScopes(physicianId: string): Promise<ConsentScopeStatus[]> {
    const consents = await this.prisma.consent.findMany({
      where: { physicianId },
      orderBy: { grantedAt: 'desc' },
    });

    return consentScopes.map((scope) => {
      const latestConsent = consents.find((consent) => consent.scope === scope);

      return {
        scope,
        // Sem registro, vale o padrão do escopo: `grantedAt` nulo com
        // `granted` verdadeiro é o processamento por IA ativo desde o cadastro.
        granted: latestConsent ? latestConsent.revokedAt === null : consentDefaults[scope],
        grantedAt: latestConsent?.grantedAt ?? null,
        revokedAt: latestConsent?.revokedAt ?? null,
      };
    });
  }

  async revokeConsent(physicianId: string, scope: string): Promise<Consent> {
    const consentScope = this.parseConsentScope(scope);
    const consent = await this.prisma.consent.findFirst({
      where: { physicianId, scope: consentScope, revokedAt: null },
    });

    if (!consent) {
      return this.revokeDefaultConsent(physicianId, consentScope);
    }

    const revokedConsent = await this.prisma.consent.update({
      where: { id: consent.id },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'CONSENT_REVOKED',
      entity: 'Consent',
      entityId: consent.id,
      payload: { scope: consentScope },
    });

    return revokedConsent;
  }

  /**
   * CC-010 — escopo ativo por padrão e sem nenhum registro: a revogação grava
   * a primeira linha já revogada. A concessão é a data do cadastro, quando o
   * padrão passou a valer; não há outra data a registrar.
   */
  private async revokeDefaultConsent(physicianId: string, scope: ConsentScope): Promise<Consent> {
    if (!consentDefaults[scope]) {
      throw new NotFoundException('Active consent not found');
    }
    const [recorded, physician] = await Promise.all([
      this.prisma.consent.findFirst({ where: { physicianId, scope }, select: { id: true } }),
      this.prisma.physician.findUnique({
        where: { id: physicianId },
        select: { createdAt: true },
      }),
    ]);
    // Com registro, a última linha já está revogada: não há o que revogar.
    if (recorded || !physician) {
      throw new NotFoundException('Active consent not found');
    }

    const revokedConsent = await this.prisma.consent.create({
      data: { physicianId, scope, grantedAt: physician.createdAt, revokedAt: new Date() },
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'CONSENT_REVOKED',
      entity: 'Consent',
      entityId: revokedConsent.id,
      payload: { scope, fromDefault: true },
    });

    return revokedConsent;
  }

  /**
   * O registro mais recente do escopo decide; sem nenhum, o padrão
   * (`consentDefaults`). Há no máximo uma linha ativa por escopo: conceder
   * com uma ativa devolve a mesma, e revogar fecha a ativa.
   */
  async checkConsent(physicianId: string, scope: string): Promise<boolean> {
    const consentScope = this.parseConsentScope(scope);
    const latest = await this.prisma.consent.findFirst({
      where: { physicianId, scope: consentScope },
      orderBy: { grantedAt: 'desc' },
      select: { revokedAt: true },
    });
    return latest ? latest.revokedAt === null : consentDefaults[consentScope];
  }

  /**
   * CC-010 — a única checagem de consentimento antes de IA com o caso do
   * médico: o `AiConsentGuard` das rotas e o worker da fila chamam aqui.
   */
  async assertAiProcessingAllowed(physicianId: string): Promise<void> {
    if (await this.checkConsent(physicianId, 'ai_processing')) return;
    this.logger.warn(`AI_CONSENT_REVOKED physicianId=${physicianId}: pedido de IA recusado`);
    throw new AiConsentRevokedException();
  }

  private parseConsentScope(scope: string): ConsentScope {
    if (!consentScopes.includes(scope as ConsentScope)) {
      throw new BadRequestException(`Unsupported consent scope: ${scope}`);
    }

    return scope as ConsentScope;
  }

  async exportPhysicianData(physicianId: string): Promise<PhysicianDataExport> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: {
        id: true,
        role: true,
        crmUf: true,
        crmNumber: true,
        email: true,
        name: true,
        crmVerified: true,
        isCurator: true,
        isMentor: true,
        subscriptionStatus: true,
        locale: true,
        specialty: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!physician) {
      throw new NotFoundException('Physician not found');
    }

    // CC-702 — a lista de espera não tem vínculo com a conta: entra pelo e-mail.
    const [betaParticipant, betaWaitlist] = await Promise.all([
      this.prisma.betaParticipant.findUnique({
        where: { physicianId },
        select: {
          physicianId: true,
          joinedAt: true,
          termsVersion: true,
          termsAcceptedAt: true,
          training: true,
          facilityType: true,
          uf: true,
          cityType: true,
          profileUpdatedAt: true,
          invite: { select: { batchLabel: true } },
        },
      }),
      this.prisma.betaWaitlistEntry.findMany({
        where: { email: { equals: physician.email, mode: 'insensitive' } },
      }),
    ]);

    const encounters = await this.prisma.encounter.findMany({
      where: { physicianId },
    });

    const encounterIds = encounters.map((e) => e.id);
    const hasEncounters = encounterIds.length > 0;
    const ofEncounters = { encounterId: { in: encounterIds } };

    const [
      documents,
      consents,
      legalAcceptances,
      auditLog,
      aiInteractions,
      recommendationDecisions,
      copilotFeedback,
      caseIntakes,
      encounterAttachments,
      audioCaptures,
      practiceSites,
      knowledgeGaps,
      mentoringRequests,
      shiftReviews,
      externalIdentities,
    ] = await Promise.all([
      this.prisma.document.findMany({ where: { physicianId } }),
      this.prisma.consent.findMany({ where: { physicianId } }),
      this.prisma.legalAcceptance.findMany({
        where: { physicianId },
        orderBy: { acceptedAt: 'asc' },
        select: {
          acceptedAt: true,
          document: {
            select: {
              type: true,
              version: true,
              contentHash: true,
              provisional: true,
              publishedAt: true,
            },
          },
        },
      }),
      this.prisma.auditLog.findMany({ where: { actorId: physicianId } }),
      hasEncounters
        ? this.prisma.aiInteraction.findMany({ where: ofEncounters })
        : Promise.resolve([]),
      this.prisma.recommendationDecision.findMany({ where: { physicianId } }),
      this.prisma.copilotFeedback.findMany({ where: { physicianId } }),
      // ADR-014 — a conversa antes do plano (caso e respostas já redigidos).
      this.prisma.caseIntake.findMany({ where: { physicianId } }),
      hasEncounters
        ? this.prisma.encounterAttachment.findMany({ where: ofEncounters })
        : Promise.resolve([]),
      this.prisma.audioCapture.findMany({
        where: { physicianId },
        select: EXPORTED_AUDIO_CAPTURE_SELECT,
      }),
      this.prisma.practiceSite.findMany({ where: { physicianId } }),
      this.prisma.knowledgeGap.findMany({
        where: { interaction: { encounter: { physicianId } } },
      }),
      this.prisma.mentoringRequest.findMany({
        where: { OR: [{ requesterId: physicianId }, { mentorId: physicianId }] },
      }),
      // CC-801 — revisões do plantão (perguntas já mascaradas, sem dado do paciente).
      this.prisma.shiftReview.findMany({
        where: { physicianId },
        include: { questions: { orderBy: { position: 'asc' } } },
      }),
      this.prisma.externalIdentity.findMany({
        where: { physicianId },
        select: {
          provider: true,
          subject: true,
          emailAtLink: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
    ]);

    return {
      exportVersion: 'lgpd-portability-v1',
      generatedAt: new Date().toISOString(),
      dataSubject: {
        type: 'physician',
        id: physicianId,
      },
      data: {
        physician,
        beta: { participant: betaParticipant, waitlist: betaWaitlist },
        encounters,
        encounterAttachments,
        documents,
        aiInteractions,
        caseIntakes,
        recommendationDecisions,
        copilotFeedback,
        audioCaptures,
        practiceSites,
        knowledgeGaps,
        mentoringRequests,
        shiftReviews,
        externalIdentities,
        consents,
        legalAcceptances,
        auditLog,
      },
    };
  }

  async requestErasure(physicianId: string): Promise<ErasureResult> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
    });

    if (!physician) {
      throw new NotFoundException('Physician not found');
    }

    // Storage antes do banco: as chaves dos PDFs só existem nas linhas de
    // Document, que a transação abaixo apaga (cascata do Encounter). Se o
    // storage falhar, nada foi apagado e o pedido pode ser repetido; na ordem
    // inversa, uma falha deixaria PDFs órfãos sem referência para achá-los.
    const storageObjects = await this.eraseDocumentPdfs(physicianId);

    const erasedRows = await this.prisma.$transaction(async (tx) => {
      // CC-702 — a lista de espera com o e-mail da conta sai (antes da
      // anonimização, que troca o e-mail). Do participante do beta saem o
      // termo e o perfil; ficam só os ids, para a contagem do lote.
      const betaWaitlistEntries = await tx.betaWaitlistEntry.deleteMany({
        where: { email: { equals: physician.email, mode: 'insensitive' } },
      });
      const betaParticipantProfile = await tx.betaParticipant.updateMany({
        where: { physicianId },
        data: {
          termsVersion: null,
          termsAcceptedAt: null,
          training: null,
          facilityType: null,
          uf: null,
          cityType: null,
          profileUpdatedAt: null,
        },
      });

      // F0-D — o CASCADE de encounters já levaria decisões e feedback junto;
      // apagar explicitamente deixa a contagem no relatório de eliminação.
      const recommendationDecisions = await tx.recommendationDecision.deleteMany({
        where: { physicianId },
      });
      const copilotFeedback = await tx.copilotFeedback.deleteMany({ where: { physicianId } });
      // Anexos e capturas de áudio também cairiam na cascata do Encounter;
      // apagá-los explicitamente dá a contagem que vai para a resposta e para a
      // trilha de auditoria. Nenhum dos dois tem objeto no storage: o anexo
      // guarda só o texto mascarado e o áudio fica cifrado na própria linha.
      const encounterAttachments = await tx.encounterAttachment.deleteMany({
        where: { encounter: { physicianId } },
      });
      const audioCaptures = await tx.audioCapture.deleteMany({
        where: { encounter: { physicianId } },
      });
      // CC-707 — pedidos de mentoria do médico (o CASCADE do encontro também
      // levaria). As respostas que ele deu como mentor ficam no caso de quem
      // pediu, com o nome anonimizado abaixo.
      const mentoringRequests = await tx.mentoringRequest.deleteMany({
        where: { requesterId: physicianId },
      });
      // CC-801 — as revisões não pendem do encontro (só as perguntas): sem
      // apagar explicitamente, a revisão vazia ficaria no médico anonimizado.
      const shiftReviewQuestions = await tx.shiftReviewQuestion.deleteMany({
        where: { physicianId },
      });
      const shiftReviews = await tx.shiftReview.deleteMany({ where: { physicianId } });
      const encounters = await tx.encounter.deleteMany({ where: { physicianId } });
      // CC-602 — onde o médico trabalha também é dado dele.
      const practiceSites = await tx.practiceSite.deleteMany({ where: { physicianId } });
      const consents = await tx.consent.deleteMany({ where: { physicianId } });
      // CC-905 — o aceite sai com a conta; o evento continua na trilha.
      const legalAcceptances = await tx.legalAcceptance.deleteMany({ where: { physicianId } });
      const refreshTokens = await tx.refreshToken.deleteMany({ where: { physicianId } });
      // CC-334 — o médico é anonimizado, não apagado: sem isto a conta
      // Google/Microsoft continuaria entrando na conta anonimizada.
      const externalIdentities = await tx.externalIdentity.deleteMany({ where: { physicianId } });

      await tx.physician.update({
        where: { id: physicianId },
        data: {
          name: 'ERASED',
          email: `erased-${physicianId}@erased.com`,
          passwordHash: `erased:${physicianId}`,
          specialty: null,
          // CC-018 — a estratégia JWT e o refresh recusam a sessão por aqui.
          erasedAt: new Date(),
        },
      });

      return {
        betaWaitlistEntries: betaWaitlistEntries.count,
        betaParticipantProfile: betaParticipantProfile.count,
        recommendationDecisions: recommendationDecisions.count,
        copilotFeedback: copilotFeedback.count,
        mentoringRequests: mentoringRequests.count,
        shiftReviewQuestions: shiftReviewQuestions.count,
        shiftReviews: shiftReviews.count,
        encounters: encounters.count,
        encounterAttachments: encounterAttachments.count,
        audioCaptures: audioCaptures.count,
        practiceSites: practiceSites.count,
        consents: consents.count,
        legalAcceptances: legalAcceptances.count,
        refreshTokens: refreshTokens.count,
        externalIdentities: externalIdentities.count,
      };
    });

    // CC-018 — só depois do commit: marcar antes trancaria o médico fora de uma
    // conta que continua dele quando a transação falha.
    this.erasureCheck.markErased(physicianId);

    const erased = { ...erasedRows, storageObjects };

    // A trilha de auditoria é append-only (AUD-001) e não é apagada: só ganha
    // esta entrada.
    await this.auditService.log({
      actorId: physicianId,
      action: 'DATA_ERASURE',
      entity: 'Physician',
      entityId: physicianId,
      payload: {
        reason: 'LGPD Art. 18, VI - Data erasure request',
        erased,
      },
    });

    return { status: 'completed', estimatedCompletion: new Date(), erased };
  }

  /**
   * Apaga do MinIO os PDFs dos documentos confirmados nos atendimentos do
   * médico e devolve quantas chaves foram apagadas.
   */
  private async eraseDocumentPdfs(physicianId: string): Promise<number> {
    const documents = await this.prisma.document.findMany({
      where: { encounter: { physicianId }, pdfObjectKey: { not: null } },
      select: { pdfObjectKey: true },
    });
    const keys = documents.flatMap((doc) => (doc.pdfObjectKey ? [doc.pdfObjectKey] : []));

    try {
      await this.storage.deleteObjects(keys);
    } catch (error) {
      this.logger.error(
        `LGPD erasure aborted for physician ${physicianId}: failed to delete ${keys.length} stored PDF(s)`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Could not delete stored files; no data was erased. Try again later.',
        { cause: error },
      );
    }

    return keys.length;
  }
}
