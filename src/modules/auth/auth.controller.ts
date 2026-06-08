import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  mfaDisableSchema,
} from './schemas/auth.schemas';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  MfaEnableInput,
  MfaVerifyInput,
  MfaDisableInput,
} from './schemas/auth.schemas';

interface RequestWithIp {
  ip?: string;
  ips?: string[];
}

function extractIp(req: RequestWithIp): string | undefined {
  return (req.ips?.[0] ?? req.ip) || undefined;
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
    @Req() req: RequestWithIp,
  ) {
    return this.authService.register(body, extractIp(req));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: RequestWithIp,
  ) {
    return this.authService.login(body, extractIp(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: RequestWithIp,
  ) {
    return this.authService.refresh(body, extractIp(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Request() req: { user: { physicianId: string }; ip?: string; ips?: string[] },
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutInput,
  ) {
    await this.authService.logout(req.user.physicianId, body.refreshToken, extractIp(req));
    return { message: 'Logged out successfully' };
  }

  /**
   * Retorna o perfil do médico autenticado incluindo crmVerified e mfaEnabled.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: { user: { physicianId: string } }) {
    return this.authService.getMe(req.user.physicianId);
  }

  // ── MFA endpoints ──────────────────────────────────────────────────────────

  /**
   * Passo 1: Gera segredo TOTP + 8 backup codes.
   * O médico deve escanear o QR code e depois chamar POST /auth/mfa/enable.
   * Os backup codes são exibidos uma única vez aqui.
   */
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async mfaSetup(@Request() req: { user: { physicianId: string } }) {
    return this.mfaService.setupMfa(req.user.physicianId);
  }

  /**
   * Passo 2: Confirma o setup enviando o primeiro código TOTP válido.
   * A partir daqui o login passa a exigir MFA.
   */
  @Post('mfa/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async mfaEnable(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(mfaEnableSchema)) body: MfaEnableInput,
  ) {
    await this.mfaService.enableMfa(req.user.physicianId, body.totpCode);
  }

  /**
   * Segunda etapa do login quando mfaRequired=true.
   * Recebe o mfaToken (curta duração) retornado pelo POST /auth/login
   * e o código TOTP ou backup code.
   */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 300000 } })
  async mfaVerify(
    @Body(new ZodValidationPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @Req() req: RequestWithIp,
  ) {
    return this.authService.verifyMfaLogin(body.mfaToken, body.code, extractIp(req));
  }

  /**
   * Desativa o MFA confirmando com o código TOTP atual.
   * Remove segredo e todos os backup codes.
   */
  @Delete('mfa')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async mfaDisable(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(mfaDisableSchema)) body: MfaDisableInput,
  ) {
    await this.mfaService.disableMfa(req.user.physicianId, body.totpCode);
  }
}
