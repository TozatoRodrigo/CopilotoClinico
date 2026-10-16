import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from '../../config/prisma.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PhysicianErasureCheck } from '../auth/physician-erasure-check.service';
import { MailAdminController } from './mail-admin.controller';
import { MailService } from './mail.service';

const SECRET = 'test-access-secret-at-least-32-characters-long';
const adminId = '11111111-1111-4111-8111-111111111111';

/**
 * Guards REAIS (JWT de verdade + RolesGuard): é o que protege o endpoint de
 * virar um disparador de e-mail para qualquer conta logada.
 */
describe('MailAdminController (HTTP)', () => {
  let app: NestFastifyApplication;
  const jwt = new JwtService({ secret: SECRET });
  const mail = { send: vi.fn() };
  const prisma = { physician: { findUnique: vi.fn() } };

  const bearer = async (role: string, physicianId = adminId) => ({
    authorization: `Bearer ${await jwt.signAsync({
      sub: physicianId,
      physicianId,
      email: 'token@nao-usado.com',
      role,
    })}`,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: SECRET })],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
      ],
      controllers: [MailAdminController],
      providers: [
        JwtStrategy,
        // CC-018 — a estratégia JWT recusa médico eliminado; aqui ninguém foi.
        { provide: PhysicianErasureCheck, useValue: { isErased: async () => false } },
        { provide: MailService, useValue: mail },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mail.send.mockReset().mockResolvedValue({ status: 'logged', channel: 'log' });
    prisma.physician.findUnique.mockReset().mockResolvedValue({ email: 'admin@strivium.com.br' });
  });

  it('refuses a request without a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/mail/test' });

    expect(res.statusCode).toBe(401);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it.each(['PHYSICIAN', 'COMPLIANCE'])('refuses the %s role', async (role) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/mail/test',
      headers: await bearer(role),
    });

    expect(res.statusCode).toBe(403);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("sends the test e-mail to the admin's own account address", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/mail/test',
      headers: await bearer('ADMIN'),
      // Um destino no corpo é ignorado: o endpoint não é relay.
      payload: { to: 'alvo@spam.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.physician.findUnique).toHaveBeenCalledWith({
      where: { id: adminId },
      select: { email: true },
    });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledWith({
      to: 'admin@strivium.com.br',
      template: { name: 'test', params: { sentAt: expect.any(Date) } },
    });
    expect(res.json()).toEqual({ status: 'logged', channel: 'log', to: 'a***@s***.com.br' });
  });

  it('answers 200 with the failure code when the provider refuses', async () => {
    mail.send.mockResolvedValue({
      status: 'failed',
      channel: 'smtp',
      reason: 'EAUTH',
      responseCode: 535,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/mail/test',
      headers: await bearer('ADMIN'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'failed',
      channel: 'smtp',
      reason: 'EAUTH',
      responseCode: 535,
      to: 'a***@s***.com.br',
    });
  });

  it('answers 404 when the admin account no longer exists', async () => {
    prisma.physician.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/mail/test',
      headers: await bearer('ADMIN'),
    });

    expect(res.statusCode).toBe(404);
    expect(mail.send).not.toHaveBeenCalled();
  });
});
