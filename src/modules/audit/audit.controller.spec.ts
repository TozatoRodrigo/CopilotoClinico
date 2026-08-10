import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';

/**
 * BUGFIX (reportado pelo usuário) — AuditController.query()/exportCsv()
 * injetavam `actorId: req.user.physicianId` incondicionalmente, ignorando
 * o que o caller enviava. Como o frontend nunca envia `actorId`
 * (web/src/app/(app)/audit/page.tsx), isso filtrava SEMPRE pelo próprio
 * usuário autenticado — um médico com role COMPLIANCE/ADMIN só via os
 * próprios eventos, nunca a trilha completa que o console de compliance
 * existe para auditar. Confirmado ao vivo: compliance@copiloto.test via
 * só os próprios AUTH_LOGIN, sem os ENCOUNTER_CREATED/DOCUMENT_CONFIRMED
 * de medico@copiloto.test.
 */
describe('AuditController', () => {
  let controller: AuditController;
  let auditServiceMock: {
    query: ReturnType<typeof vi.fn>;
    toCsv: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auditServiceMock = { query: vi.fn(), toCsv: vi.fn() };
    controller = new AuditController(auditServiceMock as unknown as AuditService);
  });

  describe('query', () => {
    it('does NOT inject actorId — compliance/admin see the full trail, not just their own events', async () => {
      const queryInput = { limit: 50, offset: 0 } as Parameters<AuditController['query']>[0];
      auditServiceMock.query.mockResolvedValue({ items: [], total: 0 });

      await controller.query(queryInput);

      expect(auditServiceMock.query).toHaveBeenCalledWith(queryInput);
      const calledWith = auditServiceMock.query.mock.calls[0]?.[0];
      expect(calledWith).not.toHaveProperty('actorId');
    });

    it('passes through an explicit actorId filter unchanged when the caller provides one', async () => {
      const otherActorId = '660e8400-e29b-41d4-a716-446655440001';
      const queryInput = {
        actorId: otherActorId,
        limit: 50,
        offset: 0,
      } as Parameters<AuditController['query']>[0];
      auditServiceMock.query.mockResolvedValue({ items: [], total: 0 });

      await controller.query(queryInput);

      expect(auditServiceMock.query).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: otherActorId }),
      );
    });

    it('returns exactly what the service produces', async () => {
      const result = { items: [{ id: 'a1' }], total: 1 };
      auditServiceMock.query.mockResolvedValue(result);

      const returned = await controller.query({
        limit: 50,
        offset: 0,
      } as Parameters<AuditController['query']>[0]);

      expect(returned).toBe(result);
    });

    it('keeps RolesGuard + COMPLIANCE/ADMIN metadata attached', () => {
      const guards = Reflect.getMetadata('__guards__', AuditController.prototype.query);
      expect(guards).toBeDefined();
      expect(guards.some((G: new () => unknown) => G === JwtAuthGuard)).toBe(true);
      expect(guards.some((G: new () => unknown) => G === RolesGuard)).toBe(true);

      const roles = Reflect.getMetadata(ROLES_KEY, AuditController.prototype.query);
      expect(roles).toEqual(['COMPLIANCE', 'ADMIN']);
    });
  });

  describe('exportCsv', () => {
    it('does NOT inject actorId, and overrides limit/offset to fetch the full filtered set', async () => {
      const queryInput = {
        entity: 'document',
        limit: 50,
        offset: 20,
      } as Parameters<AuditController['exportCsv']>[0];
      auditServiceMock.query.mockResolvedValue({ items: [], total: 0 });
      auditServiceMock.toCsv.mockReturnValue('header\n');

      await controller.exportCsv(queryInput);

      expect(auditServiceMock.query).toHaveBeenCalledWith({
        entity: 'document',
        limit: 10000,
        offset: 0,
      });
    });

    it('keeps RolesGuard + COMPLIANCE/ADMIN metadata attached', () => {
      const guards = Reflect.getMetadata('__guards__', AuditController.prototype.exportCsv);
      expect(guards).toBeDefined();
      expect(guards.some((G: new () => unknown) => G === RolesGuard)).toBe(true);

      const roles = Reflect.getMetadata(ROLES_KEY, AuditController.prototype.exportCsv);
      expect(roles).toEqual(['COMPLIANCE', 'ADMIN']);
    });
  });
});
