import { Module } from '@nestjs/common';
import { InferenceMetricsService } from './inference-metrics.service';
import { BackupHealthService } from './backup-health.service';
import { ObservabilityController } from './observability.controller';
import { BackupHealthCronService } from '../../workers/backup-health-cron.service';

@Module({
  controllers: [ObservabilityController],
  providers: [InferenceMetricsService, BackupHealthService, BackupHealthCronService],
  exports: [InferenceMetricsService, BackupHealthService],
})
export class ObservabilityModule {}
