import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import {
  Controller,
  Get,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createFakeLegalPrisma } from '../../../tests/helpers/fake-legal-prisma';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { MfaService } from '../auth/mfa.service';
import { LgpdController } from '../lgpd/lgpd.controller';
import { LgpdService } from '../lgpd/lgpd.service';
import {
  LEGAL_DOCUMENT_OUTDATED,
  TERMS_ACCEPTANCE_REQUIRED,
  type LegalAdminOverview,
  type LegalDocumentView,
  type LegalStatus,
} from '../../shared/contracts/legal';
import { LegalController } from './legal.controller';
import { LegalAdminController } from './legal-admin.controller';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalTermsGateInterceptor } from './legal-terms-gate.interceptor';

vi.mock('./legal-document-catalog', () => {
  const section = (text: string) => [{ heading: '1. Uso', paragraphs: [text] }];
  const drafts = [
    {
      type: 'terms_of_use',
      version: 'termos-v1',
      title: 'Termos',
      provisional: true,
      changeSummary: ['Primeira versão.'],
      sections: section('Texto 1.'),
    },
    {
      type: 'privacy_policy',
      version: 'politica-v1',
      title: 'Política',
      provisional: true,
      changeSummary: ['Primeira versão.'],
      sections: section('Política 1.'),
    },
    {
      type: 'terms_of_use',
      version: 'termos-v2',
      title: 'Termos',
      provisional: false,
      changeSummary: ['Cobre a mentoria.'],
      sections: section('Texto 2.'),
    },
  ];
  return {
    LEGAL_DOCUMENT_CATALOG: drafts,
    findLegalDocumentDraft: (type: string, version: string) =>
      drafts.find((draft) => draft.type === type && draft.version === version),
  };
});

const physicianId = '11111111-1111-4111-8111-111111111111';
const adminId = '44444444-4444-4444-8444-444444444444';
const complianceId = '55555555-5555-4555-8555-555555555555';

/** Uma rota protegida qualquer (no app real: casos, análise, documentos...). */
@Controller('encounters')
@UseGuards(JwtAuthGuard)
class GatedEncountersController {
  @Get()
  list() {
    return { items: [] };
  }
}

/** Rota sem autenticação: o gate não tem de quem cobrar o aceite. */
@Controller('public')
class PublicController {
  @Get()
  ping() {
    return { ok: true };
  }
}

/** Simula o JwtAuthGuard com o usuário do header `x-test-user` (JSON). */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const raw = request.headers['x-test-user'];
    if (!raw) return false;
    request.user = JSON.parse(raw);
    return true;
  }
}

function as(role: 'PHYSICIAN' | 'COMPLIANCE' | 'ADMIN', id = physicianId) {
  return { 'x-test-user': JSON.stringify({ physicianId: id, sub: id, role }) };
}

describe('LegalTermsGateInterceptor (HTTP, CC-905)', () => {
  let app: NestFastifyApplication;
  let fake: ReturnType<typeof createFakeLegalPrisma>;
  const env: Record<string, string | undefined> = {};
  const lgpd = {
    exportPhysicianData: vi.fn(),
    requestErasure: vi.fn(),
    listConsentScopes: vi.fn(),
  };
  const auth = { logout: vi.fn() };

  // App novo a cada teste: o serviço guarda as versões vigentes em cache.
  beforeEach(async () => {
    fake = createFakeLegalPrisma([{ id: physicianId }, { id: adminId }, { id: complianceId }]);
    env.LEGAL_TERMS_V2 = 'on';
    lgpd.exportPhysicianData
      .mockReset()
      .mockResolvedValue({ exportVersion: 'lgpd-portability-v1' });
    lgpd.requestErasure.mockReset().mockResolvedValue({ status: 'completed' });
    lgpd.listConsentScopes.mockReset().mockResolvedValue([]);
    auth.logout.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [
        GatedEncountersController,
        PublicController,
        LegalController,
        LegalAdminController,
        LgpdController,
        AuthController,
      ],
      providers: [
        LegalDocumentsService,
        { provide: PrismaService, useValue: fake.prisma },
        { provide: AuditService, useValue: { log: vi.fn().mockResolvedValue({}) } },
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        { provide: LgpdService, useValue: lgpd },
        { provide: AuthService, useValue: auth },
        { provide: MfaService, useValue: {} },
        { provide: APP_INTERCEPTOR, useClass: LegalTermsGateInterceptor },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function publish(type: string, version: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/legal/documents',
      headers: as('ADMIN', adminId),
      payload: { type, version },
    });
    expect(res.statusCode).toBe(201);
    return res.json<LegalDocumentView>();
  }

  async function publishV1() {
    return {
      terms: await publish('terms_of_use', 'termos-v1'),
      policy: await publish('privacy_policy', 'politica-v1'),
    };
  }

  const listEncounters = () =>
    app.inject({ method: 'GET', url: '/encounters', headers: as('PHYSICIAN') });

  describe('flag off (default)', () => {
    it('changes nothing, even with versions published and not accepted', async () => {
      await publishV1();
      env.LEGAL_TERMS_V2 = undefined;

      expect((await listEncounters()).statusCode).toBe(200);
      const status = await app.inject({
        method: 'GET',
        url: '/legal/status',
        headers: as('PHYSICIAN'),
      });
      expect(status.json<LegalStatus>()).toEqual({
        enabled: false,
        acceptanceRequired: false,
        pending: [],
      });
    });
  });

  describe('flag on', () => {
    it('lets everyone through while nothing is published', async () => {
      expect((await listEncounters()).statusCode).toBe(200);
    });

    it('blocks a protected route with 428 TERMS_ACCEPTANCE_REQUIRED until acceptance', async () => {
      await publishV1();

      const res = await listEncounters();

      expect(res.statusCode).toBe(428);
      expect(res.json()).toMatchObject({
        statusCode: 428,
        code: TERMS_ACCEPTANCE_REQUIRED,
        error: 'Precondition Required',
      });
    });

    it('keeps acceptance, logout and LGPD export/erasure open while blocked', async () => {
      await publishV1();

      const status = await app.inject({
        method: 'GET',
        url: '/legal/status',
        headers: as('PHYSICIAN'),
      });
      expect(status.statusCode).toBe(200);
      expect(status.json<LegalStatus>().pending.map((document) => document.type)).toEqual([
        'terms_of_use',
        'privacy_policy',
      ]);

      const logout = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: as('PHYSICIAN'),
        payload: {},
      });
      expect(logout.statusCode).toBe(200);
      expect(auth.logout).toHaveBeenCalled();

      const exported = await app.inject({
        method: 'GET',
        url: '/lgpd/export',
        headers: as('PHYSICIAN'),
      });
      expect(exported.statusCode).toBe(200);

      const erasure = await app.inject({
        method: 'POST',
        url: '/lgpd/erasure',
        headers: as('PHYSICIAN'),
        payload: {},
      });
      expect(erasure.statusCode).toBe(201);
      expect(lgpd.requestErasure).toHaveBeenCalledWith(physicianId);

      const consents = await app.inject({
        method: 'GET',
        url: '/lgpd/consent',
        headers: as('PHYSICIAN'),
      });
      expect(consents.statusCode).toBe(200);
    });

    it('does not touch unauthenticated routes', async () => {
      await publishV1();

      const res = await app.inject({ method: 'GET', url: '/public' });

      expect(res.statusCode).toBe(200);
    });

    it('releases the routes after both documents are accepted, not before', async () => {
      const { terms, policy } = await publishV1();

      const partial = await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: [terms.id] },
      });
      expect(partial.statusCode).toBe(200);
      expect(partial.json<LegalStatus>().acceptanceRequired).toBe(true);
      expect((await listEncounters()).statusCode).toBe(428);

      const full = await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: [policy.id] },
      });
      expect(full.json<LegalStatus>()).toEqual({
        enabled: true,
        acceptanceRequired: false,
        pending: [],
      });
      expect((await listEncounters()).statusCode).toBe(200);
    });

    it('reopens the gate when a new version is published', async () => {
      const { terms, policy } = await publishV1();
      await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: [terms.id, policy.id] },
      });
      expect((await listEncounters()).statusCode).toBe(200);

      const termsV2 = await publish('terms_of_use', 'termos-v2');

      expect((await listEncounters()).statusCode).toBe(428);
      const status = await app.inject({
        method: 'GET',
        url: '/legal/status',
        headers: as('PHYSICIAN'),
      });
      expect(status.json<LegalStatus>().pending).toEqual([
        expect.objectContaining({
          id: termsV2.id,
          version: 'termos-v2',
          previouslyAcceptedVersion: 'termos-v1',
        }),
      ]);

      // A tela aberta com o texto antigo não consegue aceitar a versão velha.
      const stale = await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: [terms.id] },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: LEGAL_DOCUMENT_OUTDATED });

      await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: [termsV2.id] },
      });
      expect((await listEncounters()).statusCode).toBe(200);
    });

    it('rejects a malformed acceptance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: ['nao-e-uuid'] },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('admin console', () => {
    it('lets only ADMIN publish a version', async () => {
      for (const [role, id] of [
        ['PHYSICIAN', physicianId],
        ['COMPLIANCE', complianceId],
      ] as const) {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/legal/documents',
          headers: as(role, id),
          payload: { type: 'terms_of_use', version: 'termos-v1' },
        });
        expect(res.statusCode).toBe(403);
      }
      expect(fake.documents).toHaveLength(0);
    });

    it('rejects an unknown document type or version', async () => {
      const unknownType = await app.inject({
        method: 'POST',
        url: '/admin/legal/documents',
        headers: as('ADMIN', adminId),
        payload: { type: 'cookies', version: 'termos-v1' },
      });
      expect(unknownType.statusCode).toBe(400);

      const unknownVersion = await app.inject({
        method: 'POST',
        url: '/admin/legal/documents',
        headers: as('ADMIN', adminId),
        payload: { type: 'terms_of_use', version: 'v99' },
      });
      expect(unknownVersion.statusCode).toBe(404);
    });

    it('shows compliance and admin the acceptance rate, but not physicians', async () => {
      const { terms, policy } = await publishV1();
      await app.inject({
        method: 'POST',
        url: '/legal/acceptances',
        headers: as('PHYSICIAN'),
        payload: { documentIds: [terms.id, policy.id] },
      });

      const denied = await app.inject({
        method: 'GET',
        url: '/admin/legal/documents',
        headers: as('PHYSICIAN'),
      });
      expect(denied.statusCode).toBe(403);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/legal/documents',
        headers: as('COMPLIANCE', complianceId),
      });
      expect(res.statusCode).toBe(200);
      const overview = res.json<LegalAdminOverview>();
      expect(overview.eligibleAccounts).toBe(3);
      expect(overview.fullyAccepted).toBe(1);
      expect(overview.types[0]?.current?.acceptance).toEqual({
        accepted: 1,
        eligible: 3,
        percent: 33.3,
      });
    });

    it('stays reachable for an admin who has not accepted yet', async () => {
      await publishV1();

      const res = await app.inject({
        method: 'GET',
        url: '/admin/legal/documents',
        headers: as('ADMIN', adminId),
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
