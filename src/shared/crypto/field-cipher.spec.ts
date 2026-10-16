import { describe, expect, it } from 'vitest';
import {
  FieldKeyError,
  SEALED_PREFIX,
  SealedValueError,
  canOpen,
  fieldKeyId,
  isSealedText,
  loadFieldKeyring,
  openJson,
  openText,
  parseFieldKey,
  sealJson,
  sealText,
  sealedKeyId,
  type FieldKeyring,
} from './field-cipher';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

function keyring(current: string, previous?: string): FieldKeyring {
  return loadFieldKeyring((name) =>
    name === 'FIELD_ENCRYPTION_KEY'
      ? current
      : name === 'FIELD_ENCRYPTION_KEY_PREVIOUS'
        ? previous
        : undefined,
  );
}

const CASE_TEXT = 'Paciente 54 anos, dor torácica há 2h, PA 90/60, troponina pendente. Ação: ECG.';

describe('field-cipher', () => {
  describe('loadFieldKeyring', () => {
    it('requires FIELD_ENCRYPTION_KEY', () => {
      expect(() => loadFieldKeyring(() => undefined)).toThrow(FieldKeyError);
      expect(() => loadFieldKeyring(() => '  ')).toThrow('FIELD_ENCRYPTION_KEY is required');
    });

    it('rejects a malformed key without echoing it', () => {
      const error = (() => {
        try {
          parseFieldKey('segredo-curto', 'FIELD_ENCRYPTION_KEY');
        } catch (err) {
          return err as Error;
        }
        throw new Error('expected parseFieldKey to throw');
      })();
      expect(error).toBeInstanceOf(FieldKeyError);
      expect(error.message).not.toContain('segredo-curto');
    });

    it('identifies each key by 8 hex of its SHA-256', () => {
      const ring = keyring(KEY_A, KEY_B);
      expect(ring.current.id).toMatch(/^[0-9a-f]{8}$/);
      expect(ring.current.id).toBe(fieldKeyId(Buffer.from(KEY_A, 'hex')));
      expect(ring.previous?.id).toBe(fieldKeyId(Buffer.from(KEY_B, 'hex')));
      expect(ring.current.id).not.toBe(ring.previous?.id);
    });

    it('ignores an empty previous key or one equal to the current key', () => {
      expect(keyring(KEY_A, '').previous).toBeNull();
      expect(keyring(KEY_A, KEY_A).previous).toBeNull();
    });
  });

  describe('sealText / openText', () => {
    it('round-trips text, unicode included', () => {
      const ring = keyring(KEY_A);
      const text = `${CASE_TEXT} — São Paulo, 37,8 °C 🔐`;
      expect(openText(ring, sealText(ring, text))).toBe(text);
    });

    it('writes enc:v1:<key id>:<base64> and never the plaintext', () => {
      const ring = keyring(KEY_A);
      const sealed = sealText(ring, CASE_TEXT);
      expect(sealed.startsWith(`${SEALED_PREFIX}${ring.current.id}:`)).toBe(true);
      expect(sealed).not.toContain('torácica');
      expect(sealedKeyId(sealed)).toBe(ring.current.id);
      expect(isSealedText(sealed)).toBe(true);
    });

    it('uses a random IV: the same text seals differently each time', () => {
      const ring = keyring(KEY_A);
      expect(sealText(ring, CASE_TEXT)).not.toBe(sealText(ring, CASE_TEXT));
    });

    it('reads plaintext as is (dual read for rows written before the flag)', () => {
      const ring = keyring(KEY_A);
      expect(openText(ring, CASE_TEXT)).toBe(CASE_TEXT);
      expect(isSealedText(CASE_TEXT)).toBe(false);
      expect(canOpen(ring, CASE_TEXT)).toBe(false);
    });

    it('opens values sealed with the previous key during a rotation', () => {
      const sealedWithA = sealText(keyring(KEY_A), CASE_TEXT);
      const rotating = keyring(KEY_B, KEY_A);
      expect(openText(rotating, sealedWithA)).toBe(CASE_TEXT);
      expect(sealedKeyId(sealText(rotating, CASE_TEXT))).toBe(rotating.current.id);
    });

    it('fails loudly — never returns ciphertext — with an unknown key', () => {
      const sealedWithA = sealText(keyring(KEY_A), CASE_TEXT);
      expect(() => openText(keyring(KEY_B), sealedWithA)).toThrow(SealedValueError);
      expect(canOpen(keyring(KEY_B), sealedWithA)).toBe(false);
    });

    it('detects tampering through the GCM auth tag', () => {
      const ring = keyring(KEY_A);
      const sealed = sealText(ring, CASE_TEXT);
      const payload = Buffer.from(sealed.split(':').at(-1)!, 'base64');
      payload.writeUInt8(payload.readUInt8(payload.length - 1) ^ 0x01, payload.length - 1);
      const tampered = `${SEALED_PREFIX}${ring.current.id}:${payload.toString('base64')}`;
      expect(() => openText(ring, tampered)).toThrow(SealedValueError);
    });

    it('rejects malformed sealed values', () => {
      const ring = keyring(KEY_A);
      for (const value of [
        `${SEALED_PREFIX}`,
        `${SEALED_PREFIX}xyz:abc`,
        `${SEALED_PREFIX}${ring.current.id}:@@@@`,
        `${SEALED_PREFIX}${ring.current.id}:AAAA`,
      ]) {
        expect(() => openText(ring, value)).toThrow(SealedValueError);
        expect(sealedKeyId(value)).toBeNull();
      }
    });

    it('keeps the error message free of clinical text', () => {
      const sealed = sealText(keyring(KEY_A), CASE_TEXT);
      try {
        openText(keyring(KEY_B), sealed);
      } catch (err) {
        expect((err as Error).message).not.toContain('torácica');
      }
    });
  });

  describe('sealJson / openJson', () => {
    it('round-trips JSON with non-integer numbers EXACTLY (no Prisma float rewrite)', () => {
      const ring = keyring(KEY_A);
      const value = {
        reasoning: CASE_TEXT,
        confidence: 0.1 + 0.2,
        tiny: 1.0000000000000002,
        nested: [{ dose: 2.5, note: 'mg/kg' }],
        empty: null,
      };
      const opened = openJson(ring, sealJson(ring, value));
      expect(opened).toEqual(value);
      expect((opened as typeof value).confidence).toBe(0.30000000000000004);
      expect((opened as typeof value).tiny).toBe(1.0000000000000002);
    });

    it('seals the whole value as one string', () => {
      const ring = keyring(KEY_A);
      const sealed = sealJson(ring, [{ questionId: 'q1', answer: 'Sim, há 3 dias' }]);
      expect(isSealedText(sealed)).toBe(true);
      expect(sealed).not.toContain('q1');
    });

    it('reads legacy JSON values as is', () => {
      const ring = keyring(KEY_A);
      const legacy = { recommendations: [{ action: 'ECG em 10 min' }] };
      expect(openJson(ring, legacy)).toBe(legacy);
      expect(openJson(ring, null)).toBeNull();
      expect(openJson(ring, 'texto em claro')).toBe('texto em claro');
    });

    it('does not leak the decrypted text when it is not JSON', () => {
      const ring = keyring(KEY_A);
      const sealedNotJson = sealText(ring, CASE_TEXT);
      try {
        openJson(ring, sealedNotJson);
        throw new Error('expected openJson to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(SealedValueError);
        expect((err as Error).message).not.toContain('Paciente');
      }
    });
  });
});
