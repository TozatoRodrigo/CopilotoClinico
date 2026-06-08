import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { WhisperService } from './whisper.service';
import { InternalServerErrorException } from '@nestjs/common';

function makeConfig(overrides: Record<string, string> = {}) {
  return new ConfigService({
    WHISPER_BASE_URL: 'https://api.groq.com/openai/v1',
    WHISPER_API_KEY: 'test-api-key',
    ...overrides,
  });
}

describe('WhisperService', () => {
  let service: WhisperService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new WhisperService(makeConfig());
    service.onModuleInit();
  });

  it('returns trimmed transcript on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('  transcribed text  '),
    } as unknown as Response);

    const result = await service.transcribe(Buffer.from('audio'), 'audio/webm');
    expect(result).toBe('transcribed text');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws InternalServerErrorException on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue('rate limit'),
    } as unknown as Response);

    await expect(service.transcribe(Buffer.from('audio'), 'audio/mpeg')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('uses custom base url when configured', async () => {
    const customService = new WhisperService(makeConfig({ WHISPER_BASE_URL: 'https://custom.api/v1' }));
    customService.onModuleInit();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('ok'),
    } as unknown as Response);

    await customService.transcribe(Buffer.from('a'), 'audio/flac');
    expect(fetch).toHaveBeenCalledWith('https://custom.api/v1/audio/transcriptions', expect.anything());
  });
});
