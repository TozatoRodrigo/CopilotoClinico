import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidelinesController } from './guidelines.controller';
import { GuidelinesService } from './guidelines.service';

describe('GuidelinesController', () => {
  let controller: GuidelinesController;
  let guidelinesServiceMock: {
    getChunkById: ReturnType<typeof vi.fn>;
    listPending: ReturnType<typeof vi.fn>;
    approveChunk: ReturnType<typeof vi.fn>;
    rejectChunk: ReturnType<typeof vi.fn>;
    suggestGuideline: ReturnType<typeof vi.fn>;
  };

  const req = { user: { physicianId: 'curator-1' } };

  beforeEach(() => {
    vi.clearAllMocks();
    guidelinesServiceMock = {
      getChunkById: vi.fn(),
      listPending: vi.fn(),
      approveChunk: vi.fn(),
      rejectChunk: vi.fn(),
      suggestGuideline: vi.fn(),
    };
    controller = new GuidelinesController(guidelinesServiceMock as unknown as GuidelinesService);
  });

  it('returns a cited guideline chunk by id', async () => {
    const chunk = {
      id: 'chunk-1',
      source: 'diretriz-dor-toracica',
      sourceVersion: '1.0',
      specialty: 'cardiologia',
      evidenceLevel: 'A',
      text: 'Guideline text about chest pain workup',
      metadata: { charStart: 10, charEnd: 90, chunkIndex: 0 },
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
    };
    guidelinesServiceMock.getChunkById.mockResolvedValue(chunk);

    const result = await controller.getChunk('chunk-1');

    expect(guidelinesServiceMock.getChunkById).toHaveBeenCalledWith('chunk-1');
    expect(result).toEqual(chunk);
  });

  it('throws NotFoundException when the chunk does not exist', async () => {
    guidelinesServiceMock.getChunkById.mockResolvedValue(null);

    await expect(controller.getChunk('missing-chunk')).rejects.toThrow(NotFoundException);
  });

  describe('listPending', () => {
    it('returns pending guideline chunks', async () => {
      const pending = [{ id: 'chunk-pending-1', source: 'Diretriz X', status: 'pending_review' }];
      guidelinesServiceMock.listPending.mockResolvedValue(pending);

      const result = await controller.listPending();

      expect(guidelinesServiceMock.listPending).toHaveBeenCalled();
      expect(result).toEqual(pending);
    });
  });

  describe('approveChunk', () => {
    it('delegates to the service with the authenticated reviewer id', async () => {
      const approved = { id: 'chunk-1', status: 'approved' };
      guidelinesServiceMock.approveChunk.mockResolvedValue(approved);

      const result = await controller.approveChunk(req, 'chunk-1');

      expect(guidelinesServiceMock.approveChunk).toHaveBeenCalledWith('chunk-1', 'curator-1');
      expect(result).toEqual(approved);
    });
  });

  describe('rejectChunk', () => {
    it('delegates to the service with the authenticated reviewer id and reason', async () => {
      const rejected = { id: 'chunk-1', status: 'rejected' };
      guidelinesServiceMock.rejectChunk.mockResolvedValue(rejected);

      const result = await controller.rejectChunk(req, 'chunk-1', { reason: 'Texto desatualizado' });

      expect(guidelinesServiceMock.rejectChunk).toHaveBeenCalledWith(
        'chunk-1',
        'curator-1',
        'Texto desatualizado',
      );
      expect(result).toEqual(rejected);
    });
  });

  /**
   * F4 — o endpoint de sugestão é o caminho aberto a qualquer médico
   * autenticado, criado depois que um médico do piloto não conseguiu incluir
   * a diretriz de dengue na base.
   */
  describe('suggest', () => {
    it('encaminha a sugestão marcando o médico autenticado como autor', async () => {
      guidelinesServiceMock.suggestGuideline.mockResolvedValue({
        source: 'ABRAMEDE dengue',
        sourceVersion: 'JBMEDE 2024',
        chunksCreated: 3,
        superseded: 0,
      });

      const result = await controller.suggest({ user: { physicianId: 'physician-77' } }, {
        text: 'Conteúdo da diretriz enviada pelo médico do plantão.',
        source: 'ABRAMEDE dengue',
        sourceVersion: 'JBMEDE 2024',
        specialty: 'medicina_de_emergencia',
      });

      expect(guidelinesServiceMock.suggestGuideline).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedBy: 'physician-77' }),
      );
      // A sugestão nunca supersede — ver suggestGuideline().
      expect(result.superseded).toBe(0);
    });

    it('não usa o guard de curadoria — é justamente o caminho para quem não é curador', () => {
      const guards = (Reflect.getMetadata('__guards__', GuidelinesController.prototype.suggest) ??
        []) as Array<{ name: string }>;

      expect(guards.map((guard) => guard.name)).toEqual(['JwtAuthGuard']);
    });
  });
});
