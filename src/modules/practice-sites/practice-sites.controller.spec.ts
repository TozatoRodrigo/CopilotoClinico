import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PracticeSitesController } from './practice-sites.controller';
import { PracticeSitesService } from './practice-sites.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';

/** Simula o JwtAuthGuard: o médico vem SEMPRE do token, nunca do corpo. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    request.user = { physicianId, role: 'PHYSICIAN' };
    return true;
  }
}

const body = {
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  hasCT: false,
  hasLab: true,
  hasICU: false,
  isSus: true,
  specialists: ['pediatria'],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 60,
  isDefault: true,
};

describe('PracticeSitesController (HTTP)', () => {
  let app: NestFastifyApplication;
  const service = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PracticeSitesController],
      providers: [{ provide: PracticeSitesService, useValue: service }],
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
    service.list.mockReset().mockResolvedValue([]);
    service.create.mockReset().mockResolvedValue({ id: siteId });
    service.update.mockReset().mockResolvedValue({ id: siteId });
    service.remove.mockReset().mockResolvedValue(undefined);
  });

  it('keeps the JWT guard on the whole controller', () => {
    const guards = Reflect.getMetadata('__guards__', PracticeSitesController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('lists the sites of the authenticated physician', async () => {
    const res = await app.inject({ method: 'GET', url: '/physicians/me/practice-sites' });

    expect(res.statusCode).toBe(200);
    expect(service.list).toHaveBeenCalledWith(physicianId);
  });

  it('creates a site for the physician of the token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/physicians/me/practice-sites',
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith(physicianId, body);
  });

  it('rejects a physicianId (or any unknown field) in the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/physicians/me/practice-sites',
      payload: { ...body, physicianId: '99999999-9999-4999-8999-999999999999' },
    });

    expect(res.statusCode).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('rejects a facility type outside the list', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/physicians/me/practice-sites',
      payload: { ...body, facilityType: 'upa_porte_4' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('updates a site by id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/physicians/me/practice-sites/${siteId}`,
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(service.update).toHaveBeenCalledWith(physicianId, siteId, body);
  });

  it('rejects a site id that is not a UUID', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/physicians/me/practice-sites/not-a-uuid',
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('deletes a site with 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/physicians/me/practice-sites/${siteId}`,
    });

    expect(res.statusCode).toBe(204);
    expect(service.remove).toHaveBeenCalledWith(physicianId, siteId);
  });
});
