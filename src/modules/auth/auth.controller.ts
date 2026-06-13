import {
  Patch,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Req,
  Res,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Patch, Throttle } from '@nestjs/throttler';
import { Patch, FastifyReply, FastifyRequest } from 'fastify';
import { Patch, AuthService } from './auth.service';
import { Patch, MfaService } from './mfa.service';
import { Patch, JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Patch, InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import {
  Patch,
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  updateProfileSchema,
} from './schemas/auth.schemas';
import { Patch, ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  Patch,
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  MfaEnableInput,
  MfaVerifyInput,
  MfaDisableInput,
  UpdateProfileInput,
} from './schemas/auth.schemas';

interface RequestWithIp {
  ip?: string;
  ips?: string[];
}

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

function extractIp(req: RequestWithIp): string | undefined {
  return (req.ips?.[0] ?? req.ip) || undefined;
}

function setAuthCookies(res: FastifyReply, accessToken: string, refreshToken: string) {
  res.setCookie('access_token', accessToken, COOKIE_BASE);
  res.setCookie('refresh_token', refreshToken, COOKIE_BASE);
}

function clearAuthCookies(res: FastifyReply) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(MfaService) private readonly mfaService: MfaService,
  ) {}

  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: FastifyRequest & RequestWithIp,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.authService.register(body, extractIp(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { physician: result.physician };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: FastifyRequest & RequestWithIp,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.authService.login(body, extractIp(req));
    if ('mfaRequired' in result && result.mfaRequired) {
      return result;
    }
    const { accessToken, refreshToken, ...rest } = result as {
      accessToken: string;
      refreshToken: string;
      physician: unknown;
    };
    setAuthCookies(res, accessToken, refreshToken);
    return rest;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: FastifyRequest & RequestWithIp,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const refreshToken =
      (req.cookies as Record<string, string>)?.refresh_token ?? body.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('No refresh token provided');
    const tokens = await this.authService.refresh({ refreshToken }, extractIp(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return {};
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Request()
    req: {
      user: { physicianId: string };
      ip?: string;
      ips?: string[];
      cookies?: Record<string, string>;
    },
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutInput,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const refreshToken = req.cookies?.refresh_token ?? body.refreshToken;
    await this.authService.logout(req.user.physicianId, refreshToken, extractIp(req));
    clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: { user: { physicianId: string } }) {
    return this.authService.getMe(req.user.physicianId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.authService.updateProfile(req.user.physicianId, body);
  }

  // ── MFA endpoints ──────────────────────────────────────────────────────────

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async mfaSetup(@Request() req: { user: { physicianId: string } }) {
    return this.mfaService.setupMfa(req.user.physicianId);
  }

  @Post('mfa/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async mfaEnable(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(mfaEnableSchema)) body: MfaEnableInput,
  ) {
    await this.mfaService.enableMfa(req.user.physicianId, body.totpCode);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 300000 } })
  async mfaVerify(
    @Body(new ZodValidationPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @Req() req: FastifyRequest & RequestWithIp,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.authService.verifyMfaLogin(body.mfaToken, body.code, extractIp(req));
    const { accessToken, refreshToken, ...rest } = result as {
      accessToken: string;
      refreshToken: string;
      mfaRequired: boolean;
      physician: unknown;
    };
    setAuthCookies(res, accessToken, refreshToken);
    return rest;
  }

  @Delete('mfa')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async mfaDisable(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(mfaDisableSchema)) body: MfaDisableInput,
    UpdateProfileInput,
  ) {
    await this.mfaService.disableMfa(req.user.physicianId, body.totpCode);
  }

  @Post('mfa/admin-reset/:physicianId')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async mfaAdminReset(@Param('physicianId') physicianId: string) {
    await this.mfaService.resetMfa(physicianId, 'admin');
  }
}
