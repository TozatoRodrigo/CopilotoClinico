import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidelinesController } from './guidelines.controller';
import { GuidelinesService } from './guidelines.service';

describe('GuidelinesController', () => {
  let controller: GuidelinesController;
  let guidelinesServiceMock: {
    getChunkById: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guidelinesServiceMock = {
      getChunkById: vi.fn(),
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
});
