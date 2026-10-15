import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
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
    PhysiciansModule,
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
  exports: [AuthService, MfaService, JwtModule],
})
export class AuthModule {}
