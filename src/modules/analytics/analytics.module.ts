import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ProductFunnelService } from './product-funnel.service';
import { AiCallReportService } from './ai-call-report.service';
import { FunnelAbandonmentCronService } from '../../workers/funnel-abandonment-cron.service';
import { AiCallAlertsCronService } from '../../workers/ai-call-alerts-cron.service';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ProductFunnelService,
    FunnelAbandonmentCronService,
    AiCallReportService,
    AiCallAlertsCronService,
  ],
  // CC-705 — o painel semanal do beta reaproveita a agregação de `ai_calls`.
  exports: [AiCallReportService],
})
export class AnalyticsModule {}
