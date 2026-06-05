import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, refreshSchema } from './schemas/auth.schemas';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { RegisterInput, LoginInput, RefreshInput } from './schemas/auth.schemas';

const ACCESS_COOKIE = 'copiloto_access_token';
const REFRESH_COOKIE = 'copiloto_refresh_token';

interface HeaderReply {
  header(name: string, value: string | string[]): unknown;
}

interface CookieRequest {
  headers: { cookie?: string };
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) reply: HeaderReply,
  ) {
    const result = await this.authService.register(body);
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return { physician: result.physician };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) reply: HeaderReply,
  ) {
    const result = await this.authService.login(body);
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return { physician: result.physician };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: HeaderReply,
    @Body() body?: Partial<RefreshInput>,
  ) {
    const refreshToken = body?.refreshToken ?? readCookie(request.headers.cookie, REFRESH_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const input = refreshSchema.parse({ refreshToken });
    const result = await this.authService.refresh(input);
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return { refreshed: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Res({ passthrough: true }) reply: HeaderReply) {
    clearAuthCookies(reply);
  }
}

function setAuthCookies(reply: HeaderReply, accessToken: string, refreshToken: string) {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = secure ? 'None' : 'Lax';
  const base = `HttpOnly; Path=/; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
  reply.header('Set-Cookie', [
    `${ACCESS_COOKIE}=${accessToken}; Max-Age=${15 * 60}; ${base}`,
    `${REFRESH_COOKIE}=${refreshToken}; Max-Age=${7 * 24 * 60 * 60}; ${base}`,
  ]);
}

function clearAuthCookies(reply: HeaderReply) {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = secure ? 'None' : 'Lax';
  const base = `HttpOnly; Path=/; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
  reply.header('Set-Cookie', [
    `${ACCESS_COOKIE}=; Max-Age=0; ${base}`,
    `${REFRESH_COOKIE}=; Max-Age=0; ${base}`,
  ]);
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
