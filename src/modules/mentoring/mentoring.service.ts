import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  MentorQueueItem,
  MentorQueueResponse,
  MentorRequestDetail,
  MentoringConfigResponse,
  MentoringNotificationsResponse,
  MentoringRequestView,
} from '../../shared/contracts/clinical';
import { MENTORING_TERMS } from './mentoring-terms';
import { isMentoringEnabled } from './mentoring.settings';
import {
  buildMentoringCaseSnapshot,
  maskFreeTextForMentor,
  pickLatestPlan,
  readStoredSnapshot,
} from './mentoring-snapshot';
import {
  planMentoringTransition,
  type MentoringAction,
  type MentoringTransitionRefusal,
} from './mentoring-transitions';
import { MENTORING_NOTIFIER, type MentoringNotifier } from './mentoring.notifier';
import type {
  AnswerMentoringRequestInput,
  CreateMentoringRequestInput,
  MentorQueueQuery,
  RateMentoringRequestInput,
} from './mentoring.schemas';

/** Análises lidas para achar o último plano válido (falhas de validação ficam de fora). */
const RECENT_ANALYSES_SCANNED = 5;
const MENTOR_QUEUE_LIMIT = 100;

const AUDIT_ACTION: Record<MentoringAction, string> = {
  claim: 'MENTORING_CLAIMED',
  release: 'MENTORING_RELEASED',
  answer: 'MENTORING_ANSWERED',
  cancel: 'MENTORING_CANCELLED',
  rate: 'MENTORING_RATED',
};

const REQUESTER_SELECT = {
  id: true,
  encounterId: true,
  status: true,
  question: true,
  termsVersion: true,
  createdAt: true,
  claimedAt: true,
  answer: true,
  answeredAt: true,
  answerSeenAt: true,
  cancelledAt: true,
  satisfaction: true,
  mentor: { select: { name: true } },
} as const satisfies Prisma.MentoringRequestSelect;

type RequesterRow = Prisma.MentoringRequestGetPayload<{ select: typeof REQUESTER_SELECT }>;

const MENTOR_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  claimedAt: true,
  answeredAt: true,
  mentorId: true,
  question: true,
  caseSnapshot: true,
  answer: true,
  satisfaction: true,
  mentor: { select: { name: true } },
} as const satisfies Prisma.MentoringRequestSelect;

type MentorRow = Prisma.MentoringRequestGetPayload<{ select: typeof MENTOR_SELECT }>;

/** O que a transição lê antes de decidir. */
const TRANSITION_SELECT = {
  id: true,
  encounterId: true,
  status: true,
  requesterId: true,
  mentorId: true,
  satisfaction: true,
  createdAt: true,
  encounter: { select: { patientRef: true } },
} as const satisfies Prisma.MentoringRequestSelect;

type TransitionRow = Prisma.MentoringRequestGetPayload<{ select: typeof TRANSITION_SELECT }>;

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function toRequesterView(row: RequesterRow): MentoringRequestView {
  return {
    id: row.id,
    encounterId: row.encounterId,
    status: row.status,
    question: row.question,
    termsVersion: row.termsVersion,
    createdAt: row.createdAt.toISOString(),
    claimedAt: iso(row.claimedAt),
    mentorName: row.mentor?.name ?? null,
    answer: row.answer,
    answeredAt: iso(row.answeredAt),
    answerSeenAt: iso(row.answerSeenAt),
    cancelledAt: iso(row.cancelledAt),
    satisfaction: row.satisfaction,
  };
}

function toQueueItem(row: MentorRow, mentorId: string): MentorQueueItem {
  const snapshot = readStoredSnapshot(row.caseSnapshot);
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    claimedAt: iso(row.claimedAt),
    answeredAt: iso(row.answeredAt),
    assignedToMe: row.mentorId === mentorId,
    mentorName: row.mentor?.name ?? null,
    vertical: snapshot.vertical,
    mainHypothesis: snapshot.plan.mainHypothesis,
    question: row.question,
  };
}

function toMentorDetail(row: MentorRow, mentorId: string): MentorRequestDetail {
  return {
    ...toQueueItem(row, mentorId),
    caseSnapshot: readStoredSnapshot(row.caseSnapshot),
    answer: row.answer,
    satisfaction: row.satisfaction,
  };
}

function refusalToException(refusal: MentoringTransitionRefusal): Error {
  switch (refusal) {
    // Não confirmar a existência de um pedido alheio (mesma regra do encontro).
    case 'not_requester':
      return new NotFoundException('Pedido de mentoria não encontrado');
    case 'own_request':
      return new ForbiddenException('Você não pode responder o próprio pedido');
    case 'claimed_by_other':
      return new ConflictException('Outro médico da equipe já assumiu este pedido');
    case 'already_rated':
      return new ConflictException('Este pedido já foi avaliado');
    case 'invalid_state':
      return new ConflictException('O pedido não aceita esta ação no estado atual');
  }
}

interface TransitionArgs {
  requestId: string;
  actorId: string;
  action: MentoringAction;
  /** Quem pode enxergar o pedido: o dono, ou o recorte institucional do mentor. */
  scope: Prisma.MentoringRequestWhereInput;
  /** Campos além de status/mentor, decididos com o pedido já lido. */
  data?: (current: TransitionRow, now: Date) => Prisma.MentoringRequestUpdateManyMutationInput;
  /** Detalhes da trilha, sem texto clínico (hashes, versões, nota). */
  auditPayload?: (current: TransitionRow, now: Date) => Record<string, unknown>;
}

/**
 * CC-707 — mentoria em modo concierge: "Discutir este caso com um médico da
 * equipe".
 *
 * O médico pede no próprio caso; o caso sai mascarado com o plano da IA
 * (mentoring-snapshot.ts) e a versão do termo aceita (CC-708) fica gravada.
 * Um mentor (`is_mentor`) assume e responde; a resposta aparece no caso e o
 * médico é avisado no app. Cada mudança de estado vai para a trilha de
 * auditoria com ids, versões e hashes — nunca o texto.
 *
 * Isolamento: o médico só enxerga os próprios pedidos (404 para o resto); o
 * mentor só enxerga pedidos sem instituição ou de uma instituição a que
 * pertence (ADR-009), nunca o próprio pedido.
 */
@Injectable()
export class MentoringService {
  private readonly logger = new Logger(MentoringService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MENTORING_NOTIFIER) private readonly notifier: MentoringNotifier,
  ) {}

  async getConfig(physicianId: string): Promise<MentoringConfigResponse> {
    if (!isMentoringEnabled(this.config)) return { enabled: false };
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { isMentor: true },
    });
    return { enabled: true, isMentor: physician?.isMentor ?? false, terms: MENTORING_TERMS };
  }

  // ── Quem pede ────────────────────────────────────────────────────────────

  async listForEncounter(
    physicianId: string,
    encounterId: string,
  ): Promise<MentoringRequestView[]> {
    await this.findOwnEncounter(physicianId, encounterId);
    const rows = await this.prisma.mentoringRequest.findMany({
      where: { encounterId, requesterId: physicianId },
      orderBy: { createdAt: 'desc' },
      select: REQUESTER_SELECT,
    });
    return rows.map(toRequesterView);
  }

  async create(
    physicianId: string,
    encounterId: string,
    input: CreateMentoringRequestInput,
  ): Promise<MentoringRequestView> {
    this.assertCurrentTerms(input.termsVersion);
    const encounter = await this.findOwnEncounter(physicianId, encounterId);
    if (encounter.status === 'cancelled') {
      throw new ConflictException('Caso cancelado não pode ser discutido com a equipe');
    }

    const analyses = await this.prisma.aiInteraction.findMany({
      where: { encounterId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ANALYSES_SCANNED,
      select: { id: true, inputRedacted: true, rawOutput: true, createdAt: true },
    });
    const latest = pickLatestPlan(analyses);
    if (!latest) {
      throw new UnprocessableEntityException(
        'O caso precisa de um plano do copiloto antes de ser discutido com a equipe',
      );
    }

    const open = await this.prisma.mentoringRequest.findFirst({
      where: { encounterId, status: { in: ['pending', 'claimed'] } },
      select: { id: true },
    });
    if (open) throw new ConflictException('Este caso já tem um pedido em aberto com a equipe');

    const caseSnapshot = buildMentoringCaseSnapshot({
      vertical: encounter.vertical,
      context: encounter.context,
      patientRef: encounter.patientRef,
      interaction: latest.interaction,
      output: latest.output,
    });
    const question = maskFreeTextForMentor(input.question, encounter.patientRef);
    const now = new Date();

    let created: RequesterRow;
    try {
      created = await this.prisma.mentoringRequest.create({
        data: {
          encounterId,
          requesterId: physicianId,
          institutionId: encounter.institutionId,
          interactionId: latest.interaction.id,
          caseSnapshot: caseSnapshot as unknown as Prisma.InputJsonValue,
          question,
          termsVersion: MENTORING_TERMS.version,
          termsAcceptedAt: now,
        },
        select: REQUESTER_SELECT,
      });
    } catch (err) {
      // Índice parcial: dois cliques simultâneos não abrem dois pedidos.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Este caso já tem um pedido em aberto com a equipe');
      }
      throw err;
    }

    await this.auditService.log({
      actorId: physicianId,
      action: 'MENTORING_REQUESTED',
      entity: 'MentoringRequest',
      entityId: created.id,
      payload: {
        encounterId,
        interactionId: latest.interaction.id,
        institutionId: encounter.institutionId,
        to: 'pending',
        termsVersion: MENTORING_TERMS.version,
        termsProvisional: MENTORING_TERMS.provisional,
        snapshotSha256: sha256(JSON.stringify(caseSnapshot)),
        questionSha256: question ? sha256(question) : null,
      },
    });

    const recipients = await this.prisma.physician.findMany({
      where: {
        isMentor: true,
        id: { not: physicianId },
        ...(encounter.institutionId
          ? { institutions: { some: { institutionId: encounter.institutionId } } }
          : {}),
      },
      select: { id: true, email: true, name: true },
    });

    this.logger.log(`MENTORING_REQUESTED requestId=${created.id} recipients=${recipients.length}`);
    if (recipients.length === 0) {
      // O pedido fica no painel; sem mentor elegível ninguém é avisado.
      this.logger.warn(`MENTORING_NO_ELIGIBLE_MENTOR requestId=${created.id}`);
    } else {
      await this.safeNotify('new_request', created.id, () =>
        this.notifier.notifyNewRequest({
          requestId: created.id,
          recipients: recipients.map((r) => ({ physicianId: r.id, email: r.email, name: r.name })),
          path: `/mentoria/${created.id}`,
        }),
      );
    }

    return toRequesterView(created);
  }

  async cancel(physicianId: string, requestId: string): Promise<MentoringRequestView> {
    await this.transition({
      requestId,
      actorId: physicianId,
      action: 'cancel',
      scope: { requesterId: physicianId },
      data: (_current, now) => ({ cancelledAt: now }),
    });
    return this.requesterView(physicianId, requestId);
  }

  async rate(
    physicianId: string,
    requestId: string,
    input: RateMentoringRequestInput,
  ): Promise<MentoringRequestView> {
    await this.transition({
      requestId,
      actorId: physicianId,
      action: 'rate',
      scope: { requesterId: physicianId },
      data: (_current, now) => ({ satisfaction: input.satisfaction, ratedAt: now }),
      auditPayload: () => ({ satisfaction: input.satisfaction }),
    });
    return this.requesterView(physicianId, requestId);
  }

  /** O médico abriu a resposta: ela deixa de ser "nova". Não é transição de estado. */
  async markAnswerSeen(physicianId: string, requestId: string): Promise<MentoringRequestView> {
    await this.prisma.mentoringRequest.updateMany({
      where: { id: requestId, requesterId: physicianId, status: 'answered', answerSeenAt: null },
      data: { answerSeenAt: new Date() },
    });
    return this.requesterView(physicianId, requestId);
  }

  async notifications(physicianId: string): Promise<MentoringNotificationsResponse> {
    const rows = await this.prisma.mentoringRequest.findMany({
      where: { requesterId: physicianId, status: 'answered', answerSeenAt: null },
      orderBy: { answeredAt: 'desc' },
      select: {
        id: true,
        encounterId: true,
        answeredAt: true,
        mentor: { select: { name: true } },
        encounter: { select: { chiefComplaint: true } },
      },
    });
    return {
      unreadAnswers: rows.map((row) => ({
        requestId: row.id,
        encounterId: row.encounterId,
        caseTitle: row.encounter.chiefComplaint,
        mentorName: row.mentor?.name ?? null,
        // `answered` sempre tem answeredAt; o fallback só satisfaz o tipo.
        answeredAt: (row.answeredAt ?? new Date(0)).toISOString(),
      })),
    };
  }

  // ── Mentor ───────────────────────────────────────────────────────────────

  async queue(mentorId: string, query: MentorQueueQuery): Promise<MentorQueueResponse> {
    const scope = await this.mentorScope(mentorId);
    const where: Prisma.MentoringRequestWhereInput =
      query.scope === 'mine'
        ? { AND: [scope, { mentorId }] }
        : { AND: [scope, { status: { in: ['pending', 'claimed'] } }] };

    const [rows, pendingCount] = await Promise.all([
      this.prisma.mentoringRequest.findMany({
        where,
        // Fila aberta: o mais antigo primeiro. "Meus": o mais recente primeiro.
        orderBy: { createdAt: query.scope === 'mine' ? 'desc' : 'asc' },
        take: MENTOR_QUEUE_LIMIT,
        select: MENTOR_SELECT,
      }),
      this.prisma.mentoringRequest.count({ where: { AND: [scope, { status: 'pending' }] } }),
    ]);

    return { items: rows.map((row) => toQueueItem(row, mentorId)), pendingCount };
  }

  async detailForMentor(mentorId: string, requestId: string): Promise<MentorRequestDetail> {
    const scope = await this.mentorScope(mentorId);
    const row = await this.prisma.mentoringRequest.findFirst({
      where: { AND: [scope, { id: requestId }] },
      select: MENTOR_SELECT,
    });
    if (!row) throw new NotFoundException('Pedido de mentoria não encontrado');
    return toMentorDetail(row, mentorId);
  }

  async claim(mentorId: string, requestId: string): Promise<MentorRequestDetail> {
    const scope = await this.mentorScope(mentorId);
    await this.transition({
      requestId,
      actorId: mentorId,
      action: 'claim',
      scope,
      data: (_current, now) => ({ claimedAt: now }),
    });
    return this.detailForMentor(mentorId, requestId);
  }

  async release(mentorId: string, requestId: string): Promise<MentorRequestDetail> {
    const scope = await this.mentorScope(mentorId);
    await this.transition({
      requestId,
      actorId: mentorId,
      action: 'release',
      scope,
      data: () => ({ claimedAt: null }),
    });
    return this.detailForMentor(mentorId, requestId);
  }

  async answer(
    mentorId: string,
    requestId: string,
    input: AnswerMentoringRequestInput,
  ): Promise<MentorRequestDetail> {
    this.assertCurrentTerms(input.termsVersion);
    const scope = await this.mentorScope(mentorId);

    const current = await this.transition({
      requestId,
      actorId: mentorId,
      action: 'answer',
      scope,
      data: (row, now) => ({
        answer: maskFreeTextForMentor(input.answer, row.encounter.patientRef),
        answeredAt: now,
        // Responder direto de `pending` assume o pedido no mesmo passo.
        claimedAt: row.status === 'pending' ? now : undefined,
        mentorTermsVersion: MENTORING_TERMS.version,
        mentorTermsAcceptedAt: now,
      }),
      auditPayload: (row, now) => ({
        mentorTermsVersion: MENTORING_TERMS.version,
        termsProvisional: MENTORING_TERMS.provisional,
        answerSha256: sha256(maskFreeTextForMentor(input.answer, row.encounter.patientRef) ?? ''),
        responseMinutes: Math.round((now.getTime() - row.createdAt.getTime()) / 60_000),
      }),
    });

    const requester = await this.prisma.physician.findUnique({
      where: { id: current.requesterId },
      select: { id: true, email: true, name: true },
    });
    if (requester) {
      await this.safeNotify('answer', requestId, () =>
        this.notifier.notifyAnswer({
          requestId,
          encounterId: current.encounterId,
          recipient: { physicianId: requester.id, email: requester.email, name: requester.name },
          path: `/encounters/${current.encounterId}`,
        }),
      );
    }

    return this.detailForMentor(mentorId, requestId);
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /**
   * Lê o pedido no recorte de quem age, decide pela máquina de estados e
   * grava com concorrência otimista: o UPDATE só passa se status, mentor e
   * nota ainda forem os lidos. Dois mentores respondendo ao mesmo tempo → um
   * vence, o outro recebe 409.
   */
  private async transition(args: TransitionArgs): Promise<TransitionRow> {
    const current = await this.prisma.mentoringRequest.findFirst({
      where: { AND: [args.scope, { id: args.requestId }] },
      select: TRANSITION_SELECT,
    });
    if (!current) throw new NotFoundException('Pedido de mentoria não encontrado');

    const plan = planMentoringTransition(current, args.action, args.actorId);
    if (!plan.ok) throw refusalToException(plan.refusal);

    const now = new Date();
    const updated = await this.prisma.mentoringRequest.updateMany({
      where: {
        id: current.id,
        status: current.status,
        mentorId: current.mentorId,
        satisfaction: current.satisfaction,
      },
      data: {
        status: plan.status,
        mentorId: plan.mentorId,
        ...(args.data?.(current, now) ?? {}),
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('O pedido mudou enquanto você agia. Recarregue a página.');
    }

    await this.auditService.log({
      actorId: args.actorId,
      action: AUDIT_ACTION[args.action],
      entity: 'MentoringRequest',
      entityId: current.id,
      payload: {
        encounterId: current.encounterId,
        from: current.status,
        to: plan.status,
        ...(args.auditPayload?.(current, now) ?? {}),
      },
    });
    this.logger.log(
      `${AUDIT_ACTION[args.action]} requestId=${current.id} from=${current.status} to=${plan.status}`,
    );

    return current;
  }

  /**
   * O que um mentor enxerga:
   * - ADR-009: pedido sem instituição ou de uma instituição do mentor;
   * - nunca o próprio pedido;
   * - pedido em aberto, ou já tratado por ele. A resposta de um colega é do
   *   médico que pediu: outro mentor não a lê.
   */
  private async mentorScope(mentorId: string): Promise<Prisma.MentoringRequestWhereInput> {
    const links = await this.prisma.physicianInstitution.findMany({
      where: { physicianId: mentorId },
      select: { institutionId: true },
    });
    return {
      AND: [
        { requesterId: { not: mentorId } },
        {
          OR: [
            { institutionId: null },
            { institutionId: { in: links.map((link) => link.institutionId) } },
          ],
        },
        { OR: [{ status: { in: ['pending', 'claimed'] } }, { mentorId }] },
      ],
    };
  }

  private async findOwnEncounter(physicianId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, physicianId },
      select: {
        id: true,
        status: true,
        vertical: true,
        context: true,
        patientRef: true,
        institutionId: true,
      },
    });
    // Mesmo 404 para encontro inexistente e de outro médico.
    if (!encounter) throw new NotFoundException('Encounter not found');
    return encounter;
  }

  private async requesterView(
    physicianId: string,
    requestId: string,
  ): Promise<MentoringRequestView> {
    const row = await this.prisma.mentoringRequest.findFirst({
      where: { id: requestId, requesterId: physicianId },
      select: REQUESTER_SELECT,
    });
    if (!row) throw new NotFoundException('Pedido de mentoria não encontrado');
    return toRequesterView(row);
  }

  /** O termo aceito tem de ser o vigente: tela aberta com termo antigo relê o novo. */
  private assertCurrentTerms(termsVersion: string): void {
    if (termsVersion !== MENTORING_TERMS.version) {
      throw new ConflictException(
        'O termo da mentoria foi atualizado. Leia a versão atual antes de continuar.',
      );
    }
  }

  /** Aviso que falha não desfaz o pedido nem a resposta. */
  private async safeNotify(
    event: 'new_request' | 'answer',
    requestId: string,
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      this.logger.warn(
        `MENTORING_NOTIFY_FAILED event=${event} requestId=${requestId} reason=${reason}`,
      );
      Sentry.captureException(err, { tags: { feature: 'mentoring', event } });
    }
  }
}
