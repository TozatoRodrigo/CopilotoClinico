import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BetaModule } from '../beta/beta.module';
import { AuthController } from './auth.controller';
import { AccountLockoutModule } from './account-lockout.module';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PhysicianErasureModule } from './physician-erasure.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PhysiciansModule } from '../physicians/physicians.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    // CC-702 — o cadastro consome o convite do beta na mesma transação.
    BetaModule,
    PhysiciansModule,
    AccountLockoutModule,
    PhysicianErasureModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, JwtStrategy],
  // A eliminação (LgpdModule) marca o médico na mesma instância do
  // PhysicianErasureCheck que a estratégia JWT lê: ver PhysicianErasureModule.
  exports: [AuthService, MfaService, PhysicianErasureModule, JwtModule],
})
export class AuthModule {}
