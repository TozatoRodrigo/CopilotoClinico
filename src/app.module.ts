import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './config/prisma.module';
import { ThrottlerConfigModule } from './config/throttler.config';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EncountersModule } from './modules/encounters/encounters.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { AuditModule } from './modules/audit/audit.module';
import { GuidelinesModule } from './modules/guidelines/guidelines.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    AiGatewayModule,
    EncountersModule,
    DocumentsModule,
    CopilotModule,
    GuidelinesModule,
    AuditModule,
    LgpdModule,
  ],
})
export class AppModule {}
