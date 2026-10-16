import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

function buildService(env: Record<string, string>): StorageService {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new StorageService(config);
}

const configuredEnv = {
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'access',
  MINIO_SECRET_KEY: 'secret',
  MINIO_BUCKET: 'documents-test',
};

describe('StorageService.deleteObjects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op for an empty key list, even without storage configured', async () => {
    const service = buildService({});

    await expect(service.deleteObjects([])).resolves.toBeUndefined();
  });

  it('fails loudly when there are keys to delete but storage is not configured', async () => {
    const service = buildService({});

    await expect(service.deleteObjects(['documents/enc-1/doc-1.pdf'])).rejects.toThrow(
      'Storage not configured',
    );
  });

  it('sends one DeleteObject per key to the configured bucket', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const service = buildService(configuredEnv);
    const keys = Array.from({ length: 12 }, (_, i) => `documents/enc-${i}/doc-${i}.pdf`);

    await service.deleteObjects(keys);

    expect(send).toHaveBeenCalledTimes(12);
    const sent = send.mock.calls.map(([command]) => command as DeleteObjectCommand);
    expect(sent.every((command) => command instanceof DeleteObjectCommand)).toBe(true);
    expect(sent.map((command) => command.input)).toEqual(
      keys.map((key) => ({ Bucket: 'documents-test', Key: key })),
    );
  });

  it('propagates a failed deletion', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('AccessDenied') as never);
    const service = buildService(configuredEnv);

    await expect(service.deleteObjects(['documents/enc-1/doc-1.pdf'])).rejects.toThrow(
      'AccessDenied',
    );
  });
});
