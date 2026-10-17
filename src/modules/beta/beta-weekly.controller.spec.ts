import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { BadRequestException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { BetaWeeklyController } from './beta-weekly.controller';
import { BetaWeeklyService } from './beta-weekly.service';

/**
 * Simula o JwtAuthGuard com o usuário do header `x-test-user` (JSON); sem o
 * header, recusa como o guard real. O RolesGuard é o REAL.
 */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const header = request.headers['x-test-user'];
    if (!header) return false;
    request.user = JSON.parse(header);
    return true;
  }
}

function asUser(role: string) {
  return {
    'x-test-user': JSON.stringify({ physicianId: '99999999-9999-4999-8999-999999999999', role }),
  };
}

describe('painel semanal do beta (HTTP, CC-705)', () => {
  let app: NestFastifyApplication;
  const weekly = { report: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BetaWeeklyController],
      providers: [{ provide: BetaWeeklyService, useValue: weekly }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    weekly.report.mockResolvedValue({ markdown: '## Beta' });
  });

  it.each(['ADMIN', 'COMPLIANCE'])('lets %s read the current week', async (role) => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/beta/weekly',
      headers: asUser(role),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ markdown: '## Beta' });
    expect(weekly.report).toHaveBeenCalledWith(undefined);
  });

  it('refuses a regular physician and a request without session', async () => {
    const physician = await app.inject({
      method: 'GET',
      url: '/admin/beta/weekly',
      headers: asUser('PHYSICIAN'),
    });
    expect(physician.statusCode).toBe(403);

    const anonymous = await app.inject({ method: 'GET', url: '/admin/beta/weekly' });
    expect(anonymous.statusCode).toBe(403);
    expect(weekly.report).not.toHaveBeenCalled();
  });

  it('passes the requested week and rejects what is not a calendar date', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/admin/beta/weekly?week=2026-10-07',
      headers: asUser('ADMIN'),
    });
    expect(ok.statusCode).toBe(200);
    expect(weekly.report).toHaveBeenCalledWith('2026-10-07');

    for (const week of ['2026-02-30', '12/10/2026', 'semana']) {
      const res = await app.inject({
        method: 'GET',
        url: `/admin/beta/weekly?week=${encodeURIComponent(week)}`,
        headers: asUser('ADMIN'),
      });
      expect(res.statusCode).toBe(400);
    }
    expect(weekly.report).toHaveBeenCalledTimes(1);
  });

  it('answers 400 for a week that has not started', async () => {
    weekly.report.mockRejectedValue(
      new BadRequestException('A semana de 2026-10-19 ainda não começou'),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/admin/beta/weekly?week=2026-10-19',
      headers: asUser('ADMIN'),
    });
    expect(res.statusCode).toBe(400);
  });
});
