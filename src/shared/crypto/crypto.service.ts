import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FIELD_ENCRYPTION_KEY_ENV,
  FIELD_ENCRYPTION_KEY_PREVIOUS_ENV,
  decryptGcm,
  encryptGcm,
  parseFieldKey,
  type FieldKeyring,
} from './field-cipher';

/**
 * Cifra do segredo do MFA e do áudio, no formato legado `iv:authTag:ciphertext`
 * (hex). O texto clínico usa o formato versionado de field-cipher.ts, gravado
 * pela extensão do Prisma (ver config/clinical-text) — mesma chave, mesmas
 * primitivas.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private keyring!: FieldKeyring;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit(): void {
    const current = parseFieldKey(
      this.config.getOrThrow<string>(FIELD_ENCRYPTION_KEY_ENV),
      FIELD_ENCRYPTION_KEY_ENV,
    );
    const previousRaw = this.config.get<string>(FIELD_ENCRYPTION_KEY_PREVIOUS_ENV)?.trim();
    const previous = previousRaw
      ? parseFieldKey(previousRaw, FIELD_ENCRYPTION_KEY_PREVIOUS_ENV)
      : null;
    this.keyring = { current, previous: previous?.id === current.id ? null : previous };
  }

  encrypt(plaintext: string): string {
    const { iv, authTag, ciphertext } = encryptGcm(this.keyring.current.bytes, plaintext);
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  /**
   * O formato legado não diz qual chave cifrou: tenta a atual e, durante uma
   * rotação (`FIELD_ENCRYPTION_KEY_PREVIOUS`), a anterior — sem isso, trocar a
   * chave derrubaria o login de todo médico com MFA.
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted field format; expected iv:authTag:ciphertext');
    }
    const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string];
    const gcm = {
      iv: Buffer.from(ivHex, 'hex'),
      authTag: Buffer.from(authTagHex, 'hex'),
      ciphertext: Buffer.from(ciphertextHex, 'hex'),
    };
    try {
      return decryptGcm(this.keyring.current.bytes, gcm);
    } catch (err) {
      if (!this.keyring.previous) throw err;
      return decryptGcm(this.keyring.previous.bytes, gcm);
    }
  }

  encryptIfPresent(value: string | null | undefined): string | null {
    if (value == null) return null;
    return this.encrypt(value);
  }

  decryptIfPresent(value: string | null | undefined): string | null {
    if (value == null) return null;
    return this.decrypt(value);
  }
}
