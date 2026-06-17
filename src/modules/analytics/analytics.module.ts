import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ProductFunnelService } from './product-funnel.service';
import { FunnelAbandonmentCronService } from '../../workers/funnel-abandonment-cron.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ProductFunnelService, FunnelAbandonmentCronService],
})
export class AnalyticsModule {}
