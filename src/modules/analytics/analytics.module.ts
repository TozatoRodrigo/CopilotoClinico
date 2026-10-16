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
})
export class AnalyticsModule {}
