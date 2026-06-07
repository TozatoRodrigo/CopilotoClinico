import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

function buildService(keyOverride?: string): CryptoService {
  const service = new CryptoService({
    getOrThrow: (key: string) => {
      if (key === 'FIELD_ENCRYPTION_KEY') return keyOverride ?? VALID_KEY;
      throw new Error(`Unexpected config key: ${key}`);
    },
  } as unknown as ConfigService);
  service.onModuleInit();
  return service;
}

describe('CryptoService', () => {
  describe('onModuleInit', () => {
    it('throws when FIELD_ENCRYPTION_KEY is missing', () => {
      const service = new CryptoService({
        getOrThrow: () => {
          throw new Error('missing');
        },
      } as unknown as ConfigService);
      expect(() => service.onModuleInit()).toThrow();
    });

    it('throws when key is not 64 hex chars', () => {
      const service = new CryptoService({
        getOrThrow: () => 'tooshort',
      } as unknown as ConfigService);
      expect(() => service.onModuleInit()).toThrow('FIELD_ENCRYPTION_KEY');
    });

    it('throws when key contains non-hex characters', () => {
      const service = new CryptoService({
        getOrThrow: () => 'z'.repeat(64),
      } as unknown as ConfigService);
      expect(() => service.onModuleInit()).toThrow('FIELD_ENCRYPTION_KEY');
    });
  });

  describe('encrypt / decrypt', () => {
    it('roundtrips a plaintext value', () => {
      const svc = buildService();
      const plaintext = 'JBSWY3DPEHPK3PXP'; // typical TOTP secret
      expect(svc.decrypt(svc.encrypt(plaintext))).toBe(plaintext);
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const svc = buildService();
      const a = svc.encrypt('same');
      const b = svc.encrypt('same');
      expect(a).not.toBe(b);
    });

    it('stores iv:authTag:ciphertext in three colon-separated parts', () => {
      const svc = buildService();
      const parts = svc.encrypt('test').split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // 12 bytes → 24 hex chars
      expect(parts[1]).toHaveLength(32); // 16 bytes → 32 hex chars
    });

    it('throws on tampered ciphertext (auth tag mismatch)', () => {
      const svc = buildService();
      const encrypted = svc.encrypt('secret');
      const [iv, tag, ct] = encrypted.split(':') as [string, string, string];
      const tampered = `${iv}:${tag}:${ct.slice(0, -2)}ff`;
      expect(() => svc.decrypt(tampered)).toThrow();
    });

    it('throws on malformed encrypted string', () => {
      const svc = buildService();
      expect(() => svc.decrypt('notvalid')).toThrow('Invalid encrypted field format');
    });

    it('roundtrips unicode content', () => {
      const svc = buildService();
      const unicode = '日本語テスト🔐';
      expect(svc.decrypt(svc.encrypt(unicode))).toBe(unicode);
    });
  });

  describe('encryptIfPresent / decryptIfPresent', () => {
    it('returns null for null input', () => {
      const svc = buildService();
      expect(svc.encryptIfPresent(null)).toBeNull();
      expect(svc.decryptIfPresent(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      const svc = buildService();
      expect(svc.encryptIfPresent(undefined)).toBeNull();
      expect(svc.decryptIfPresent(undefined)).toBeNull();
    });

    it('encrypts and decrypts a non-null value', () => {
      const svc = buildService();
      const value = 'TOTPSECRETBASE32';
      const enc = svc.encryptIfPresent(value);
      expect(enc).not.toBeNull();
      expect(svc.decryptIfPresent(enc!)).toBe(value);
    });
  });
});
