import { Controller, Get, Param, Query, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type { AiCallReport, AiCallRequestTrace } from '../../shared/contracts/ai-calls';
import { AnalyticsService } from './analytics.service';
import { ProductFunnelService } from './product-funnel.service';
import { AiCallReportService } from './ai-call-report.service';
import {
  aiCallReportQuerySchema,
  aiCallRequestIdSchema,
  type AiCallReportQuery,
} from './ai-call-report.schemas';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService,
    @Inject(ProductFunnelService) private readonly funnelService: ProductFunnelService,
    @Inject(AiCallReportService) private readonly aiCallReport: AiCallReportService,
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

  /**
   * PI-02 — painel de custo de IA. Diferente de /stats e /funnel acima,
   * este endpoint expõe custo POR MÉDICO — dado de uso profissional, não de
   * paciente, mas ainda assim restrito a Compliance/Admin (nunca visível a
   * outro médico comum). RolesGuard aqui, não só no front: o front redireciona
   * a UI, mas a API precisa recusar a chamada por si mesma.
   */
  @Get('cost')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'COMPLIANCE')
  async getCostReport(
    @Query('days') days?: string,
    @Query('projectedUsers') projectedUsers?: string,
  ) {
    const parsedDays = days ? Math.min(Math.max(parseInt(days, 10) || 30, 1), 365) : 30;
    const parsedUsers = projectedUsers
      ? Math.min(Math.max(parseInt(projectedUsers, 10) || 100, 1), 100000)
      : 100;
    return this.analyticsService.getCostReport(parsedDays, parsedUsers);
  }

  /**
   * CC-004 — custo, latência e falhas das chamadas de IA por etapa e modelo
   * (`ai_calls`). Só metadados, mas o mesmo papel do painel de custo: decide
   * o roteamento e não é assunto de médico comum.
   */
  @Get('ai-calls')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'COMPLIANCE')
  getAiCallReport(
    @Query(new ZodValidationPipe(aiCallReportQuerySchema)) query: AiCallReportQuery,
  ): Promise<AiCallReport> {
    return this.aiCallReport.getReport(query.period);
  }

  /** CC-004 — as chamadas de uma requisição, pelo `x-request-id`. */
  @Get('ai-calls/requests/:requestId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'COMPLIANCE')
  getAiCallRequestTrace(
    @Param('requestId', new ZodValidationPipe(aiCallRequestIdSchema)) requestId: string,
  ): Promise<AiCallRequestTrace> {
    return this.aiCallReport.getRequestTrace(requestId);
  }
}
