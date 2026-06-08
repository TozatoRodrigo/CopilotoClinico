import { Controller, Get, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { InferenceMetricsService } from './inference-metrics.service';
import { BackupHealthService } from './backup-health.service';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';

@Controller('v1/admin')
@UseGuards(InternalServiceGuard)
export class ObservabilityController {
  constructor(
    private readonly metrics: InferenceMetricsService,
    private readonly backupHealth: BackupHealthService,
  ) {}

  /**
   * Retorna métricas de inferência (latência e custo) para o período solicitado.
   *
   * Query params:
   *   - period: '24h' | '7d' (default: '24h')
   *
   * Requer header `x-internal-token`.
   */
  @Get('metrics/inference')
  async getInferenceMetrics(@Query('period') period?: string) {
    const window = period === '7d' ? '7d' : '24h';
    return this.metrics.getMetrics(window);
  }

  /**
   * Executa verificação de saúde do backup/banco de dados manualmente.
   * Retorna 200 independente do resultado — o corpo indica se está saudável.
   *
   * Requer header `x-internal-token`.
   */
  @Post('backup-health/check')
  @HttpCode(HttpStatus.OK)
  async checkBackupHealth() {
    return this.backupHealth.check();
  }
}
