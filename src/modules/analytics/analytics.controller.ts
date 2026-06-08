import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analyticsService: AnalyticsService) {}

  @Get('stats')
  async getStats(@Query('days') days?: string) {
    const parsedDays = days ? Math.min(parseInt(days, 10) || 30, 365) : 30;
    return this.analyticsService.getStats(parsedDays);
  }
}
