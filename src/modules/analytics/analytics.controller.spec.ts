import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ProductFunnelService } from './product-funnel.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsServiceMock: {
    getStats: ReturnType<typeof vi.fn>;
    getCostReport: ReturnType<typeof vi.fn>;
  };
  let funnelServiceMock: { getFunnel: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsServiceMock = { getStats: vi.fn(), getCostReport: vi.fn() };
    funnelServiceMock = { getFunnel: vi.fn() };
    controller = new AnalyticsController(
      analyticsServiceMock as unknown as AnalyticsService,
      funnelServiceMock as unknown as ProductFunnelService,
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
});
