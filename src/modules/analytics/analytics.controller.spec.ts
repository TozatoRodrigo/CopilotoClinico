import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ProductFunnelService } from './product-funnel.service';
import { AiCallReportService } from './ai-call-report.service';
import { aiCallReportQuerySchema, aiCallRequestIdSchema } from './ai-call-report.schemas';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsServiceMock: {
    getStats: ReturnType<typeof vi.fn>;
    getCostReport: ReturnType<typeof vi.fn>;
  };
  let funnelServiceMock: { getFunnel: ReturnType<typeof vi.fn> };
  let aiCallReportMock: {
    getReport: ReturnType<typeof vi.fn>;
    getRequestTrace: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsServiceMock = { getStats: vi.fn(), getCostReport: vi.fn() };
    funnelServiceMock = { getFunnel: vi.fn() };
    aiCallReportMock = { getReport: vi.fn(), getRequestTrace: vi.fn() };
    controller = new AnalyticsController(
      analyticsServiceMock as unknown as AnalyticsService,
      funnelServiceMock as unknown as ProductFunnelService,
      aiCallReportMock as unknown as AiCallReportService,
    );
  });

  describe('getCostReport (PI-02)', () => {
    it('defaults to 30 days and 100 projected users when no query params are given', async () => {
      analyticsServiceMock.getCostReport.mockResolvedValue({ totals: {} });

      await controller.getCostReport();

      expect(analyticsServiceMock.getCostReport).toHaveBeenCalledWith(30, 100);
    });

    it('parses valid days and projectedUsers query params', async () => {
      analyticsServiceMock.getCostReport.mockResolvedValue({ totals: {} });

      await controller.getCostReport('7', '500');

      expect(analyticsServiceMock.getCostReport).toHaveBeenCalledWith(7, 500);
    });

    it('clamps days above 365 down to 365', async () => {
      analyticsServiceMock.getCostReport.mockResolvedValue({ totals: {} });

      await controller.getCostReport('9999');

      expect(analyticsServiceMock.getCostReport).toHaveBeenCalledWith(365, 100);
    });

    it('clamps a negative days value up to 1', async () => {
      analyticsServiceMock.getCostReport.mockResolvedValue({ totals: {} });

      // '0' não serve para este teste: parseInt('0') é falsy, então cai no
      // fallback "?? 30" antes mesmo de chegar no clamp — comportamento
      // correto (dias=0 não faz sentido), mas não exercita o Math.max abaixo.
      await controller.getCostReport('-5');

      expect(analyticsServiceMock.getCostReport).toHaveBeenCalledWith(1, 100);
    });

    it('falls back to defaults on non-numeric query params instead of NaN', async () => {
      analyticsServiceMock.getCostReport.mockResolvedValue({ totals: {} });

      await controller.getCostReport('not-a-number', 'also-not-a-number');

      expect(analyticsServiceMock.getCostReport).toHaveBeenCalledWith(30, 100);
    });

    it('returns exactly what the service produces', async () => {
      const report = { totals: { totalCost: 42 } };
      analyticsServiceMock.getCostReport.mockResolvedValue(report);

      const result = await controller.getCostReport('30');

      expect(result).toBe(report);
    });

    /**
     * PI-02 — a proteção de fato é RolesGuard.canActivate (testado em
     * roles.guard.spec.ts). Este teste garante que a rota CONTINUA anotada
     * com @UseGuards(RolesGuard) + @Roles('ADMIN','COMPLIANCE') — um
     * refactor que remover os decorators por engano silenciosamente abriria
     * custo por médico para qualquer usuário autenticado.
     */
    it('keeps the RolesGuard + ADMIN/COMPLIANCE metadata attached to getCostReport', () => {
      const guards = Reflect.getMetadata('__guards__', AnalyticsController.prototype.getCostReport);
      expect(guards).toBeDefined();
      expect(guards.some((G: new () => unknown) => G === RolesGuard)).toBe(true);

      const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.getCostReport);
      expect(roles).toEqual(['ADMIN', 'COMPLIANCE']);
    });
  });

  describe('ai-calls (CC-004)', () => {
    it('passes the validated period to the report service', async () => {
      const report = { totals: { calls: 3 } };
      aiCallReportMock.getReport.mockResolvedValue(report);

      const result = await controller.getAiCallReport(
        aiCallReportQuerySchema.parse({ period: '30d' }),
      );

      expect(aiCallReportMock.getReport).toHaveBeenCalledWith('30d');
      expect(result).toBe(report);
    });

    it('defaults to 7 days and rejects an unknown period with 400', () => {
      const pipe = new ZodValidationPipe(aiCallReportQuerySchema);

      expect(pipe.transform({})).toEqual({ period: '7d' });
      expect(() => pipe.transform({ period: '90d' })).toThrow('Validation failed');
    });

    it('searches a request by its x-request-id and refuses ids the API never records', async () => {
      const trace = { requestId: 'req-12345678', calls: [] };
      aiCallReportMock.getRequestTrace.mockResolvedValue(trace);
      const pipe = new ZodValidationPipe(aiCallRequestIdSchema);

      const result = await controller.getAiCallRequestTrace(
        pipe.transform('req-12345678') as string,
      );

      expect(aiCallReportMock.getRequestTrace).toHaveBeenCalledWith('req-12345678');
      expect(result).toBe(trace);
      expect(() => pipe.transform("x' OR 1=1 --")).toThrow('Validation failed');
      expect(() => pipe.transform('short')).toThrow('Validation failed');
    });

    /**
     * O 403 do médico comum vem do RolesGuard (roles.guard.spec.ts); aqui se
     * garante que as duas rotas continuam anotadas com ele.
     */
    it.each(['getAiCallReport', 'getAiCallRequestTrace'] as const)(
      'keeps RolesGuard + ADMIN/COMPLIANCE on %s',
      (method) => {
        const handler = AnalyticsController.prototype[method];
        const guards = Reflect.getMetadata('__guards__', handler);
        expect(guards.some((G: new () => unknown) => G === RolesGuard)).toBe(true);
        expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMIN', 'COMPLIANCE']);
      },
    );

    it.each([
      ['PHYSICIAN', false],
      ['COMPLIANCE', true],
      ['ADMIN', true],
    ] as const)('RolesGuard on the real route metadata: %s allowed=%s', (role, allowed) => {
      const context = {
        getHandler: () => AnalyticsController.prototype.getAiCallReport,
        getClass: () => AnalyticsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as unknown as ExecutionContext;
      const guard = new RolesGuard(new Reflector());

      if (allowed) expect(guard.canActivate(context)).toBe(true);
      else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
