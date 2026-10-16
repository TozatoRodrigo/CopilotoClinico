import { Injectable, Inject, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PhysicianErasureCheck } from '../physician-erasure-check.service';

interface JwtPayload {
  sub: string;
  email: string;
  physicianId: string;
  role: string;
  // Presente apenas em tokens de propósito restrito (ex.: mfa_pending),
  // nunca em access/refresh tokens de sessão completa — ver validate().
  scope?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(PhysicianErasureCheck) private readonly erasureCheck: PhysicianErasureCheck,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, string> }) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // SEC-01 — defesa em profundidade: um access/refresh token de sessão
    // completa nunca carrega `scope`. Rejeitar aqui garante que um token de
    // propósito restrito (ex.: mfa_pending, emitido antes do 2º fator ser
    // verificado) nunca seja aceito como sessão autenticada, mesmo que no
    // futuro venha a ser assinado com o mesmo segredo por engano.
    if (payload.scope) {
      throw new UnauthorizedException('Token de propósito restrito não pode ser usado como sessão');
    }

    // CC-018 — a assinatura e o exp não sabem que o cadastro foi eliminado
    // (LGPD): sem isto, o access token seguia valendo até expirar.
    if (await this.erasureCheck.isErased(payload.physicianId)) {
      this.logger.warn(`AUTH_ERASED_PHYSICIAN_TOKEN_REJECTED: physician ${payload.physicianId}`);
      throw new UnauthorizedException('Sessão encerrada: cadastro eliminado');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      physicianId: payload.physicianId,
      role: payload.role,
    };
  }
}
