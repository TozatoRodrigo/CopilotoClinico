import { Controller, Post, Body, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, refreshSchema } from './schemas/auth.schemas';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { RegisterInput, LoginInput, RefreshInput } from './schemas/auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    return this.authService.refresh(body);
  }
}
