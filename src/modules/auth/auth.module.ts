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
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { ExternalIdentityService } from './oauth/external-identity.service';
import { IdTokenVerifier } from './oauth/id-token-verifier';
import { OAUTH_FETCH, type OAuthFetch } from './oauth/oauth-http';

const oauthFetch: OAuthFetch = (input, init) => fetch(input, init);

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
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    MfaService,
    JwtStrategy,
    // CC-334 — login com Google/Microsoft.
    OAuthService,
    ExternalIdentityService,
    IdTokenVerifier,
    { provide: OAUTH_FETCH, useValue: oauthFetch },
  ],
  // A eliminação (LgpdModule) marca o médico na mesma instância do
  // PhysicianErasureCheck que a estratégia JWT lê: ver PhysicianErasureModule.
  exports: [AuthService, MfaService, PhysicianErasureModule, JwtModule],
})
export class AuthModule {}
