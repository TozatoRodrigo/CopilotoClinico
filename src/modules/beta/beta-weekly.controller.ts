import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type { BetaWeeklyReport } from '../../shared/contracts/beta-weekly';
import { BetaWeeklyService } from './beta-weekly.service';
import { weeklyQuerySchema, type WeeklyQuery } from './schemas/beta-weekly.schemas';

/**
 * CC-705 — painel semanal do beta (`GET /admin/beta/weekly?week=AAAA-MM-DD`).
 * Só agregados, como a ativação: Admin e Compliance leem; médico comum não.
 */
@Controller('admin/beta/weekly')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'COMPLIANCE')
export class BetaWeeklyController {
  constructor(@Inject(BetaWeeklyService) private readonly weekly: BetaWeeklyService) {}

  @Get()
  report(
    @Query(new ZodValidationPipe(weeklyQuerySchema)) query: WeeklyQuery,
  ): Promise<BetaWeeklyReport> {
    return this.weekly.report(query.week);
  }
}
