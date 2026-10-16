import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type BetaInvite } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  formatInviteCode,
  normalizeInviteCode,
  type BetaInviteListResponse,
  type BetaInviteView,
  type BetaRegistrationStatus,
} from '../../shared/contracts/beta';
import { BetaInviteInvalidException, BetaInviteRequiredException } from './beta.errors';
import { isBetaInviteRequired } from './beta.settings';
import { generateInviteCode, inviteProblem, inviteStatus, type RandomIndex } from './invite-code';
import type { CreateInvitesInput } from './schemas/beta.schemas';

/**
 * O que o cadastro pode fazer: conta aberta (sem convite, com a flag
 * desligada) ou conta pelo convite já conferido.
 */
export type BetaAdmission =
  | { kind: 'open' }
  | {
      kind: 'invite';
      inviteId: string;
      batchLabel: string;
      waitlistEntryId: string | null;
    };

/** O convite com quem o usou, como o console admin mostra. */
export const inviteWithUses = {
  participants: {
    select: {
      joinedAt: true,
      physician: { select: { id: true, name: true, email: true } },
    },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.BetaInviteInclude;

export type InviteWithUses = Prisma.BetaInviteGetPayload<{ include: typeof inviteWithUses }>;

export interface NewInvites {
  batchLabel: string;
  maxUses: number;
  expiresAt: Date;
  createdById: string;
  waitlistEntryId?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Colisão de código é improvável (~5 × 10¹¹ códigos); refaz o lote se acontecer. */
const CODE_COLLISION_ATTEMPTS = 3;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function toInviteView(invite: InviteWithUses, now: Date): BetaInviteView {
  return {
    id: invite.id,
    code: formatInviteCode(invite.code),
    batchLabel: invite.batchLabel,
    maxUses: invite.maxUses,
    usesCount: invite.usesCount,
    expiresAt: invite.expiresAt.toISOString(),
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    status: inviteStatus(invite, now),
    fromWaitlist: invite.waitlistEntryId !== null,
    uses: invite.participants.map((use) => ({
      physicianId: use.physician.id,
      name: use.physician.name,
      email: use.physician.email,
      joinedAt: use.joinedAt.toISOString(),
    })),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * CC-702 — convites do beta: a checagem do cadastro e o que o console admin
 * faz com os códigos.
 *
 * O cadastro passa por duas chamadas, nesta ordem:
 * 1. `admit(código)` antes de qualquer trabalho caro (hash da senha): com
 *    `BETA_INVITE_REQUIRED` ligada, sem código válido não há cadastro;
 * 2. `createAccount(admissão, criar)` cria a conta e consome um uso do
 *    convite na MESMA transação — se o último uso foi levado por outro
 *    cadastro entre as duas chamadas, a conta não é criada.
 *
 * Ponto de extensão do cadastro pelo login social (CC-334, PR #183):
 * `AuthService.registerWithExternalIdentity` faz o mesmo par, com o código
 * vindo de `OAuthSignupRequest.inviteCode`.
 */
@Injectable()
export class BetaInviteService {
  private readonly logger = new Logger(BetaInviteService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /** Público: o cadastro exige convite agora? O código digitado serve? */
  async registrationStatus(rawCode: string | undefined): Promise<BetaRegistrationStatus> {
    const inviteRequired = isBetaInviteRequired(this.config);
    const code = normalizeInviteCode(rawCode ?? '');
    if (!code) return { inviteRequired, invite: null };

    const invite = await this.prisma.betaInvite.findUnique({ where: { code } });
    const problem = invite ? inviteProblem(invite, new Date()) : 'not_found';
    return {
      inviteRequired,
      invite: problem ? { valid: false, reason: problem } : { valid: true },
    };
  }

  /**
   * Antes de criar a conta. Sem código: aberto com a flag desligada, recusa
   * (`BETA_INVITE_REQUIRED`) com ela ligada. Com código, ele precisa servir
   * mesmo com a flag desligada: quem digitou espera entrar pelo convite.
   */
  async admit(rawCode: string | undefined): Promise<BetaAdmission> {
    const code = normalizeInviteCode(rawCode ?? '');
    if (!code) {
      if (!isBetaInviteRequired(this.config)) return { kind: 'open' };
      this.logger.warn('BETA_INVITE_REFUSED reason=missing');
      throw new BetaInviteRequiredException();
    }

    const invite = await this.prisma.betaInvite.findUnique({ where: { code } });
    const problem = invite ? inviteProblem(invite, new Date()) : 'not_found';
    if (!invite || problem) {
      this.logger.warn(`BETA_INVITE_REFUSED reason=${problem ?? 'not_found'}`);
      throw new BetaInviteInvalidException(problem ?? 'not_found');
    }

    return {
      kind: 'invite',
      inviteId: invite.id,
      batchLabel: invite.batchLabel,
      waitlistEntryId: invite.waitlistEntryId,
    };
  }

  /**
   * Cria a conta (`create`) e, se veio por convite, consome um uso, registra
   * o participante do beta e marca a lista de espera da pessoa como
   * cadastrada — tudo na mesma transação.
   */
  async createAccount<T extends { id: string; email: string }>(
    admission: BetaAdmission,
    create: (db: Prisma.TransactionClient) => Promise<T>,
    ip?: string,
  ): Promise<T> {
    if (admission.kind === 'open') return create(this.prisma);

    const now = new Date();
    const account = await this.prisma.$transaction(async (tx) => {
      const created = await create(tx);

      // UPDATE condicional: o banco decide quem leva o último uso.
      const claimed = await tx.betaInvite.updateMany({
        where: {
          id: admission.inviteId,
          revokedAt: null,
          expiresAt: { gt: now },
          usesCount: { lt: tx.betaInvite.fields.maxUses },
        },
        data: { usesCount: { increment: 1 } },
      });
      if (claimed.count === 0) {
        const current = await tx.betaInvite.findUnique({ where: { id: admission.inviteId } });
        const reason = current ? (inviteProblem(current, now) ?? 'exhausted') : 'not_found';
        this.logger.warn(`BETA_INVITE_REFUSED reason=${reason} stage=claim`);
        throw new BetaInviteInvalidException(reason);
      }

      await tx.betaParticipant.create({
        data: { physicianId: created.id, inviteId: admission.inviteId },
      });

      const sameEmail = created.email.trim().toLowerCase();
      await tx.betaWaitlistEntry.updateMany({
        where: {
          status: { not: 'registered' },
          OR: [
            { email: sameEmail },
            ...(admission.waitlistEntryId ? [{ id: admission.waitlistEntryId }] : []),
          ],
        },
        data: { status: 'registered' },
      });

      return created;
    });

    this.logger.log(`BETA_INVITE_REDEEMED inviteId=${admission.inviteId}`);
    await this.auditSilently({
      actorId: account.id,
      action: 'BETA_INVITE_REDEEMED',
      entity: 'BetaInvite',
      entityId: admission.inviteId,
      payload: { batchLabel: admission.batchLabel },
      ip,
    });
    return account;
  }

  // ── Console admin ─────────────────────────────────────────────────────────

  async list(): Promise<BetaInviteListResponse> {
    const now = new Date();
    const [invites, batches] = await Promise.all([
      this.prisma.betaInvite.findMany({
        include: inviteWithUses,
        orderBy: { createdAt: 'desc' },
        // Beta de dezenas de médicos: o teto só protege a tela.
        take: 500,
      }),
      this.prisma.betaInvite.groupBy({
        by: ['batchLabel'],
        _count: { _all: true },
        _sum: { usesCount: true },
        orderBy: { batchLabel: 'asc' },
      }),
    ]);

    return {
      invites: invites.map((invite) => toInviteView(invite, now)),
      batches: batches.map((batch) => ({
        batchLabel: batch.batchLabel,
        invites: batch._count._all,
        uses: batch._sum.usesCount ?? 0,
      })),
    };
  }

  async createBatch(adminId: string, input: CreateInvitesInput): Promise<BetaInviteView[]> {
    const now = new Date();
    const invites = await this.insertInvites(
      {
        batchLabel: input.batchLabel,
        maxUses: input.maxUses,
        expiresAt: addDays(now, input.validDays),
        createdById: adminId,
      },
      input.quantity,
    );

    this.logger.log(`BETA_INVITES_CREATED quantity=${invites.length} maxUses=${input.maxUses}`);
    await this.auditSilently({
      actorId: adminId,
      action: 'BETA_INVITES_CREATED',
      entity: 'BetaInvite',
      entityId: invites[0]?.id ?? 'none',
      payload: {
        batchLabel: input.batchLabel,
        quantity: invites.length,
        maxUses: input.maxUses,
        validDays: input.validDays,
        inviteIds: invites.map((invite) => invite.id),
      },
    });

    return invites.map((invite) => toInviteView({ ...invite, participants: [] }, now));
  }

  /** Revogar é definitivo; revogar de novo devolve o convite como está. */
  async revoke(adminId: string, inviteId: string): Promise<BetaInviteView> {
    const invite = await this.prisma.betaInvite.findUnique({
      where: { id: inviteId },
      include: inviteWithUses,
    });
    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.revokedAt) return toInviteView(invite, new Date());

    const now = new Date();
    const revoked = await this.prisma.betaInvite.update({
      where: { id: inviteId },
      data: { revokedAt: now },
      include: inviteWithUses,
    });
    await this.auditSilently({
      actorId: adminId,
      action: 'BETA_INVITE_REVOKED',
      entity: 'BetaInvite',
      entityId: inviteId,
      payload: { batchLabel: invite.batchLabel, usesCount: invite.usesCount },
    });
    return toInviteView(revoked, now);
  }

  /**
   * Grava `quantity` convites com códigos novos. Usado pelo lote do admin e
   * pela aprovação da lista de espera.
   */
  async insertInvites(
    data: NewInvites,
    quantity: number,
    random?: RandomIndex,
  ): Promise<BetaInvite[]> {
    for (let attempt = 1; ; attempt++) {
      const codes = new Set<string>();
      while (codes.size < quantity) codes.add(generateInviteCode(random));
      try {
        return await this.prisma.betaInvite.createManyAndReturn({
          data: [...codes].map((code) => ({ code, ...data })),
        });
      } catch (err) {
        if (attempt < CODE_COLLISION_ATTEMPTS && isUniqueViolation(err)) {
          this.logger.warn(`BETA_INVITE_CODE_COLLISION attempt=${attempt}`);
          continue;
        }
        throw err;
      }
    }
  }

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch((err: unknown) => {
      this.logger.error(
        `BETA_AUDIT_FAILED action=${params.action}: ${err instanceof Error ? err.message : 'erro'}`,
      );
    });
  }
}
