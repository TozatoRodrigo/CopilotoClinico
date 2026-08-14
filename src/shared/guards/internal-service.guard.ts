import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * SEC-03 — compara dois segredos em tempo constante.
 *
 * `!==` compara byte a byte e retorna assim que encontra a primeira
 * diferença — em teoria vaza, via timing, quanto do prefixo do token o
 * atacante já acertou. Hashear ambos os lados primeiro (SHA-256, saída de
 * tamanho fixo) evita também o vazamento de tamanho que `timingSafeEqual`
 * sozinho teria se os dois valores tivessem comprimentos diferentes.
 */
function safeCompare(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Guard para endpoints de uso interno (service-to-service).
 *
 * Valida o header `x-internal-token` contra a variável de ambiente
 * `INTERNAL_SERVICE_TOKEN`. Endpoints protegidos por este guard nunca
 * devem ser expostos publicamente — utilizar em conjunto com regras de
 * firewall/rede que restrinjam o acesso à sub-rede interna.
 *
 * Uso: @UseGuards(InternalServiceGuard)
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const token = request.headers['x-internal-token'];
    const expected = this.config.get<string>('INTERNAL_SERVICE_TOKEN');

    if (!expected) {
      throw new UnauthorizedException(
        'INTERNAL_SERVICE_TOKEN não configurado — endpoint indisponível',
      );
    }

    if (!token || typeof token !== 'string' || !safeCompare(token, expected)) {
      throw new UnauthorizedException('Token de serviço interno inválido');
    }

    return true;
  }
}
