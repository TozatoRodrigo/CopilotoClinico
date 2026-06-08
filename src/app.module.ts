import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './config/prisma.module';
import { ThrottlerConfigModule } from './config/throttler.config';
import { CryptoModule } from './shared/crypto/crypto.module';
import { ThrottlerBehindProxyGuard } from './shared/guards/throttler-behind-proxy.guard';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EncountersModule } from './modules/encounters/encounters.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { AuditModule } from './modules/audit/audit.module';
import { GuidelinesModule } from './modules/guidelines/guidelines.module';
import { PhysiciansModule } from './modules/physicians/physicians.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { AudioModule } from './modules/audio/audio.module';
import { RedisModule } from './modules/redis/redis.module';
import { PiiLogSanitizerInterceptor } from './shared/interceptors/pii-log-sanitizer.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerConfigModule,
    PrismaModule,
    CryptoModule,
    HealthModule,
    AuthModule,
    AiGatewayModule,
    EncountersModule,
    DocumentsModule,
    CopilotModule,
    GuidelinesModule,
    AuditModule,
    LgpdModule,
    PhysiciansModule,
    ObservabilityModule,
    AudioModule,
    RedisModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PiiLogSanitizerInterceptor,
    },
  ],
})
export class AppModule {}
