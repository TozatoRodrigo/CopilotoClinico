import { Controller, Post, Body, HttpCode, HttpStatus, Inject, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, refreshSchema } from './schemas/auth.schemas';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { RegisterInput, LoginInput, RefreshInput } from './schemas/auth.schemas';

interface RequestWithIp {
  ip?: string;
  ips?: string[];
}

function extractIp(req: RequestWithIp): string | undefined {
  return (req.ips?.[0] ?? req.ip) || undefined;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

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
}
