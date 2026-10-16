/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import {
  ClientIpRequest,
  DEFAULT_TRUSTED_PROXY_HOPS,
  parseTrustedProxyHops,
  resolveClientIp,
} from '../http/client-ip';

const AUTH_CONTROLLER_PATH = 'auth';

// Teto da memória de bloqueios já avisados; passou disso, recomeça do zero.
const MAX_REPORTED_BLOCKS = 10_000;

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ThrottlerBehindProxyGuard.name);
  private trustedProxyHops = DEFAULT_TRUSTED_PROXY_HOPS;
  // Chave do throttler -> fim do bloqueio já avisado (ms). Um ataque vira uma
  // linha de log por rastreador e rota, não uma por requisição recusada.
  private readonly reportedBlocks = new Map<string, number>();

  // CC-025 — lido uma vez, na subida: um valor inválido avisa uma vez só, não
  // a cada requisição.
  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    const { hops, rejected } = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
    if (rejected !== null) {
      this.logger.warn(
        `TRUSTED_PROXY_HOPS inválido ("${rejected}"): usando ${hops}. Esperado inteiro >= 0.`,
      );
    }
    this.trustedProxyHops = hops;
  }

  // CC-025 — o primeiro IP do X-Forwarded-For é do cliente e burlava o limite
  // de /auth/login e do MFA: bastava variar o cabeçalho a cada tentativa.
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return resolveClientIp(req as ClientIpRequest, this.trustedProxyHops);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (this.isFirstRefusalOfBlock(detail)) {
      // Sem o IP: o rastreador é dado pessoal e não ajuda a agir pelo log.
      const event = this.isAuthRoute(context) ? 'AUTH_RATE_LIMITED' : 'RATE_LIMITED';
      const route = `${context.getClass().name}.${context.getHandler().name}`;
      this.logger.warn(
        `${event} reason=ip route=${route} limit=${detail.limit} ttlMs=${detail.ttl} blockedForS=${detail.timeToBlockExpire}`,
      );
    }
    return super.throwThrottlingException(context, detail);
  }

  private isAuthRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.get<string | undefined>(PATH_METADATA, context.getClass()) ===
      AUTH_CONTROLLER_PATH
    );
  }

  private isFirstRefusalOfBlock(detail: ThrottlerLimitDetail): boolean {
    const now = Date.now();
    const reportedUntil = this.reportedBlocks.get(detail.key);
    if (reportedUntil !== undefined && reportedUntil > now) return false;
    if (this.reportedBlocks.size >= MAX_REPORTED_BLOCKS) this.reportedBlocks.clear();
    this.reportedBlocks.set(detail.key, now + detail.timeToBlockExpire * 1000);
    return true;
  }
}
