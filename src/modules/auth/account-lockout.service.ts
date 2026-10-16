import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';

/**
 * Segredos que a conta já identificada prova e que dá para chutar: o código
 * do MFA (6 dígitos, 10^6 combinações) e a senha atual na troca de senha. A
 * senha do login também tem contador aqui, mas por e-mail
 * (`reserveLoginAttempt`): no login a conta pode nem existir.
 */
export type LockoutScope = 'mfa' | 'password_change';

/** Cada contador da tabela; aparece como `scope=` nos logs. */
type LockoutCounter = LockoutScope | 'login';

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
  scope: LockoutCounter,
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
 * CC-025 — limite de tentativas por conta para os segredos de `LockoutScope`;
 * CC-026 — e para a senha do login.
 *
 * Uma tabela e uma política (`login_security_states`, `AUTH_LOCKOUT_*`), com
 * um contador por segredo: o login usa a linha do e-mail, como sempre usou;
 * MFA e troca de senha, `sha256("<escopo>:<physicianId>")`. Dividir o
 * contador do login abriria um atalho: o login certo zera o contador, e quem
 * ataca o MFA já tem a senha, então zeraria o bloqueio do MFA a cada 5 chutes.
 *
 * A tentativa é RESERVADA antes de conferir o segredo, num UPDATE condicional
 * (`failed_count < max`). No Postgres, UPDATEs simultâneos na mesma linha se
 * enfileiram e cada um reavalia o WHERE: mil requisições em paralelo não
 * passam de `maxAttempts` conferências. Lendo antes e gravando depois (como o
 * login fazia até o CC-026), todas leriam 0 antes da primeira gravação.
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
    if (!(await this.reserve(scope, lockoutKey(scope, physicianId), physicianId))) {
      throw new AccountLockedException();
    }
  }

  /**
   * CC-026 — a mesma reserva para a senha do login, no contador por e-mail.
   * `physicianId` é `null` quando o e-mail não tem cadastro (a tentativa conta
   * igual). Devolve `false` com a conta bloqueada, sem lançar: o login
   * responde 401 como a senha errada, para não revelar que o e-mail existe.
   */
  async reserveLoginAttempt(email: string, physicianId: string | null): Promise<boolean> {
    return this.reserve('login', loginLockoutKey(email), physicianId);
  }

  /** O segredo conferiu: zera o contador do escopo. */
  async clear(scope: LockoutScope, physicianId: string): Promise<void> {
    await this.reset(lockoutKey(scope, physicianId));
  }

  /** A senha do login conferiu: zera só o contador do login, não o do MFA. */
  async clearLogin(email: string): Promise<void> {
    await this.reset(loginLockoutKey(email));
  }

  /** `true` = tentativa reservada; `false` = conta bloqueada ou no teto. */
  private async reserve(
    counter: LockoutCounter,
    identifierHash: string,
    physicianId: string | null,
  ): Promise<boolean> {
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
      // A linha do login pode ter nascido de um e-mail ainda sem cadastro: o
      // id entra quando aparece, para o runbook achar a linha pelo médico.
      data: {
        failedCount: { increment: 1 },
        lastFailedAt: now,
        ...(physicianId === null ? {} : { physicianId }),
      },
    });
    if (reserved.count === 1) return true;

    // No teto e ainda sem bloqueio: esta é a primeira recusa, bloqueia agora.
    const locked = await this.prisma.loginSecurityState.updateMany({
      where: { identifierHash, lockedUntil: null, failedCount: { gte: this.policy.maxAttempts } },
      data: { lockedUntil: new Date(now.getTime() + this.policy.durationMs) },
    });
    if (locked.count > 0) {
      this.logger.warn(
        `AUTH_ACCOUNT_LOCKED scope=${counter} subject=${subjectTag(physicianId)} durationMs=${this.policy.durationMs}`,
      );
    }
    this.logger.warn(accountRateLimitedLog(counter, physicianId));
    return false;
  }

  private async reset(identifierHash: string): Promise<void> {
    await this.prisma.loginSecurityState.updateMany({
      where: { identifierHash },
      data: { failedCount: 0, lockedUntil: null, lastFailedAt: null },
    });
  }
}

/**
 * Linha do contador do login: sha256 do e-mail normalizado. É também por ela
 * que se acha a linha gravada sem `physician_id` (e-mail sem cadastro, ou
 * digitado com outra caixa), que só se encontra pelo hash.
 */
export function loginLockoutKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Prefixo por escopo: nunca colide com a linha do login, que é o sha256 do e-mail. */
export function lockoutKey(scope: LockoutScope, physicianId: string): string {
  return createHash('sha256').update(`${scope}:${physicianId}`).digest('hex');
}
