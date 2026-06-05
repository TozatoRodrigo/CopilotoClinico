import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  physicianId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ConfigService) config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractJwtFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return { sub: payload.sub, email: payload.email, physicianId: payload.physicianId };
  }
}

function extractJwtFromCookie(request: { headers: { cookie?: string } }): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('copiloto_access_token='))
    ?.slice('copiloto_access_token='.length);

  return token ?? null;
}
