import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';

/**
 * Segredos que a conta já identificada prova e que dá para chutar: o código
 * do MFA (6 dígitos, 10^6 combinações) e a senha atual na troca de senha. O
 * login tem caminho próprio em AuthService, por e-mail.
 */
export type LockoutScope = 'mfa' | 'password_change';

export interface LockoutPolicy {
  maxAttempts: number;
  windowMs: number;
  durationMs: number;
}

const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  durationMs: 15 * 60 * 1000,
};

/**
 * As mesmas envs e os mesmos padrões do bloqueio do login (`AUTH_LOCKOUT_*`,
 * lidas também em AuthService): uma política só para login, MFA e troca de senha.
 */
export function readLockoutPolicy(config: ConfigService): LockoutPolicy {
  return {
    maxAttempts: positiveNumber(
      config,
      'AUTH_LOCKOUT_MAX_ATTEMPTS',
      DEFAULT_LOCKOUT_POLICY.maxAttempts,
    ),
    windowMs: positiveNumber(config, 'AUTH_LOCKOUT_WINDOW_MS', DEFAULT_LOCKOUT_POLICY.windowMs),
    durationMs: positiveNumber(
      config,
      'AUTH_LOCKOUT_DURATION_MS',
      DEFAULT_LOCKOUT_POLICY.durationMs,
    ),
  };
}

function positiveNumber(config: ConfigService, key: string, fallback: number): number {
  const value = Number(config.get<string | number>(key, fallback));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Hash curto do id: correlaciona as linhas de log da mesma conta sem expor o id. */
export function subjectTag(id: string | null | undefined): string {
  return id ? createHash('sha256').update(id).digest('hex').slice(0, 12) : 'unknown';
}

export function accountRateLimitedLog(
  scope: LockoutScope | 'login',
  subjectId: string | null | undefined,
): string {
  return `AUTH_RATE_LIMITED reason=account scope=${scope} subject=${subjectTag(subjectId)}`;
}

/**
 * 429 e não 401: quem chega aqui já passou pela senha (MFA) ou tem sessão
 * (troca de senha), então dizer que bloqueou não entrega nada a um atacante, e
 * o médico entende por que o código certo foi recusado. O front já trata 429.
 */
export class AccountLockedException extends HttpException {
  constructor() {
    super(
      'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * CC-025 — limite de tentativas por conta para os segredos de `LockoutScope`.
 *
 * Reaproveita a tabela e a política do bloqueio do login
 * (`login_security_states`, `AUTH_LOCKOUT_*`), mas com contador próprio por
 * escopo: a linha é `sha256("<escopo>:<physicianId>")`. Dividir o contador do
 * login abriria um atalho: o login certo zera o contador, e quem ataca o MFA
 * já tem a senha, então zeraria o bloqueio do MFA a cada 5 chutes.
 *
 * Diferente do login, que lê e depois grava, a tentativa é RESERVADA antes de
 * conferir o segredo, num UPDATE condicional (`failed_count < max`). No
 * Postgres, UPDATEs simultâneos na mesma linha se enfileiram e cada um
 * reavalia o WHERE: mil requisições em paralelo não passam de `maxAttempts`
 * conferências. Lendo antes, todas leriam 0 antes da primeira gravação.
 *
 * Por isso aqui `failed_count` conta as tentativas desde o último acerto
 * (inclusive as em andamento) e `last_failed_at` é a hora da última tentativa.
 * Com `maxAttempts` tentativas sem acerto dentro da janela, a seguinte é
 * recusada e a conta fica bloqueada por `durationMs`.
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);
  private readonly policy: LockoutPolicy;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.policy = readLockoutPolicy(config);
  }

  /**
   * Chame antes de conferir o segredo; a tentativa já fica contada. Lança
   * `AccountLockedException` (429) se a conta está bloqueada ou no teto.
   */
  async reserveAttempt(scope: LockoutScope, physicianId: string): Promise<void> {
    const identifierHash = lockoutKey(scope, physicianId);
    const now = new Date();

    await this.prisma.loginSecurityState.createMany({
      data: [{ identifierHash, physicianId }],
      skipDuplicates: true,
    });

    // Bloqueio vencido, ou nenhuma tentativa dentro da janela: recomeça do
    // zero. O WHERE repete a condição, então uma requisição simultânea que
    // acabou de reservar (last_failed_at = agora) não tem a reserva apagada.
    await this.prisma.loginSecurityState.updateMany({
      where: {
        identifierHash,
        OR: [
          { lockedUntil: { lte: now } },
          {
            lockedUntil: null,
            lastFailedAt: { lt: new Date(now.getTime() - this.policy.windowMs) },
          },
        ],
      },
      data: { failedCount: 0, lockedUntil: null, lastFailedAt: null },
    });

    const reserved = await this.prisma.loginSecurityState.updateMany({
      where: { identifierHash, lockedUntil: null, failedCount: { lt: this.policy.maxAttempts } },
      data: { failedCount: { increment: 1 }, lastFailedAt: now },
    });
    if (reserved.count === 1) return;

    // No teto e ainda sem bloqueio: esta é a primeira recusa, bloqueia agora.
    const locked = await this.prisma.loginSecurityState.updateMany({
      where: { identifierHash, lockedUntil: null, failedCount: { gte: this.policy.maxAttempts } },
      data: { lockedUntil: new Date(now.getTime() + this.policy.durationMs) },
    });
    if (locked.count > 0) {
      this.logger.warn(
        `AUTH_ACCOUNT_LOCKED scope=${scope} subject=${subjectTag(physicianId)} durationMs=${this.policy.durationMs}`,
      );
    }
    this.logger.warn(accountRateLimitedLog(scope, physicianId));
    throw new AccountLockedException();
  }

  /** O segredo conferiu: zera o contador do escopo. */
  async clear(scope: LockoutScope, physicianId: string): Promise<void> {
    await this.prisma.loginSecurityState.updateMany({
      where: { identifierHash: lockoutKey(scope, physicianId) },
      data: { failedCount: 0, lockedUntil: null, lastFailedAt: null },
    });
  }
}

/** Prefixo por escopo: nunca colide com a linha do login, que é o sha256 do e-mail. */
export function lockoutKey(scope: LockoutScope, physicianId: string): string {
  return createHash('sha256').update(`${scope}:${physicianId}`).digest('hex');
}
