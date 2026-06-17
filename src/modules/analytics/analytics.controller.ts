import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { ProductFunnelService } from './product-funnel.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService,
    @Inject(ProductFunnelService) private readonly funnelService: ProductFunnelService,
  ) {}

  @Get('stats')
  async getStats(@Query('days') days?: string) {
    const parsedDays = days ? Math.min(parseInt(days, 10) || 30, 365) : 30;
    return this.analyticsService.getStats(parsedDays);
  }

  /**
   * F5 — funil de produto (loop de decisão + ativação).
   * O parâmetro `demoCase` segmenta pelo caso-norte (ex.: gripal).
   * LGPD-safe: resposta contém apenas contagens, razões e durações.
   */
  @Get('funnel')
  async getFunnel(@Query('days') days?: string, @Query('demoCase') demoCase?: string) {
    return this.funnelService.getFunnel({
      days: days ? parseInt(days, 10) || 7 : 7,
      demoCase,
    });
  }
}
