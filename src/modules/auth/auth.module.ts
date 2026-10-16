import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PhysicianErasureCheck } from './physician-erasure-check.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PhysiciansModule } from '../physicians/physicians.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    PhysiciansModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, PhysicianErasureCheck, JwtStrategy],
  // PhysicianErasureCheck é exportado para a eliminação (LgpdModule) marcar o
  // médico na hora: o cache em memória precisa ser a mesma instância.
  exports: [AuthService, MfaService, PhysicianErasureCheck, JwtModule],
})
export class AuthModule {}
