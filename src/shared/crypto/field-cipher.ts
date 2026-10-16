import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Cifra de campo do banco: AES-256-GCM com a chave `FIELD_ENCRYPTION_KEY`.
 *
 * Duas serializações usam as mesmas primitivas:
 * - legado, `iv:authTag:ciphertext` em hex — segredo do MFA e áudio
 *   (CryptoService.encrypt/decrypt);
 * - versionada, `enc:v1:<id da chave>:<base64(iv ‖ authTag ‖ ciphertext)>` —
 *   texto clínico (CC-207, ADR-021). O prefixo separa valor cifrado de texto
 *   em claro na leitura dupla, e o id da chave diz qual chave abre o valor
 *   durante uma rotação.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_HEX = /^[0-9a-fA-F]{64}$/;
const KEY_ID_HEX_LENGTH = 8;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const FIELD_ENCRYPTION_KEY_ENV = 'FIELD_ENCRYPTION_KEY';
export const FIELD_ENCRYPTION_KEY_PREVIOUS_ENV = 'FIELD_ENCRYPTION_KEY_PREVIOUS';

/** Prefixo do valor cifrado no formato versionado. */
export const SEALED_PREFIX = 'enc:v1:';

export interface FieldKey {
  /** 8 hex do SHA-256 da chave: identifica a chave sem revelá-la. */
  readonly id: string;
  readonly bytes: Buffer;
}

export interface FieldKeyring {
  /** Cifra tudo o que é gravado. */
  readonly current: FieldKey;
  /** Só decifra: a chave anterior durante uma rotação. */
  readonly previous: FieldKey | null;
}

/** Chave ausente ou mal formada. A mensagem nunca traz o valor da chave. */
export class FieldKeyError extends Error {
  override readonly name = 'FieldKeyError';
}

/** Valor cifrado que não abre. A mensagem nunca traz o conteúdo. */
export class SealedValueError extends Error {
  override readonly name = 'SealedValueError';
}

export function fieldKeyId(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, KEY_ID_HEX_LENGTH);
}

export function parseFieldKey(raw: string, envName: string): FieldKey {
  const hex = raw.trim();
  if (!KEY_HEX.test(hex)) {
    throw new FieldKeyError(
      `${envName} must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32`,
    );
  }
  const bytes = Buffer.from(hex, 'hex');
  return { id: fieldKeyId(bytes), bytes };
}

/**
 * Lê as chaves do ambiente. A atual é obrigatória; a anterior é opcional e
 * existe só durante uma rotação (vazia = sem rotação). Igual à atual é
 * ignorada, para um `.env` copiado não fingir que há rotação em curso.
 */
export function loadFieldKeyring(read: (name: string) => string | undefined): FieldKeyring {
  const currentRaw = read(FIELD_ENCRYPTION_KEY_ENV);
  if (!currentRaw?.trim()) {
    throw new FieldKeyError(`${FIELD_ENCRYPTION_KEY_ENV} is required`);
  }
  const current = parseFieldKey(currentRaw, FIELD_ENCRYPTION_KEY_ENV);

  const previousRaw = read(FIELD_ENCRYPTION_KEY_PREVIOUS_ENV);
  if (!previousRaw?.trim()) return { current, previous: null };
  const previous = parseFieldKey(previousRaw, FIELD_ENCRYPTION_KEY_PREVIOUS_ENV);
  return { current, previous: previous.id === current.id ? null : previous };
}

export interface GcmParts {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

export function encryptGcm(key: Buffer, plaintext: string): GcmParts {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { iv, authTag: cipher.getAuthTag(), ciphertext };
}

/** Lança se a chave não é a que cifrou ou se o valor foi alterado (auth tag). */
export function decryptGcm(key: Buffer, { iv, authTag, ciphertext }: GcmParts): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Só confere o prefixo — não garante que o valor abre. */
export function isSealedText(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SEALED_PREFIX);
}

interface SealedParts extends GcmParts {
  keyId: string;
}

function parseSealed(value: string): SealedParts {
  const rest = value.slice(SEALED_PREFIX.length);
  const separator = rest.indexOf(':');
  const keyId = rest.slice(0, separator);
  const payload = rest.slice(separator + 1);
  if (
    separator !== KEY_ID_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(keyId) ||
    !BASE64.test(payload) ||
    payload.length % 4 !== 0
  ) {
    throw new SealedValueError('Malformed sealed value');
  }
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new SealedValueError('Malformed sealed value');
  }
  return {
    keyId,
    iv: bytes.subarray(0, IV_BYTES),
    authTag: bytes.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES),
    ciphertext: bytes.subarray(IV_BYTES + AUTH_TAG_BYTES),
  };
}

/** Id da chave que cifrou o valor; `null` se não é um valor cifrado bem formado. */
export function sealedKeyId(value: string): string | null {
  if (!isSealedText(value)) return null;
  try {
    return parseSealed(value).keyId;
  } catch {
    return null;
  }
}

export function sealText(keyring: FieldKeyring, plaintext: string): string {
  const { iv, authTag, ciphertext } = encryptGcm(keyring.current.bytes, plaintext);
  const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  return `${SEALED_PREFIX}${keyring.current.id}:${payload}`;
}

/**
 * Leitura dupla: valor sem o prefixo é texto em claro (gravado antes da
 * cifra, ou com a flag desligada) e volta como está. Valor com o prefixo
 * precisa abrir — chave desconhecida ou conteúdo alterado lançam, nunca
 * devolvem o texto cifrado no lugar do clínico.
 */
export function openText(keyring: FieldKeyring, value: string): string {
  if (!isSealedText(value)) return value;
  const parts = parseSealed(value);
  const key = [keyring.current, keyring.previous].find(
    (candidate) => candidate?.id === parts.keyId,
  );
  if (!key) {
    throw new SealedValueError(`Sealed value uses unknown key ${parts.keyId}`);
  }
  try {
    return decryptGcm(key.bytes, parts);
  } catch {
    throw new SealedValueError(`Sealed value does not open with key ${parts.keyId}`);
  }
}

/** O valor tem o prefixo E abre com uma das chaves. */
export function canOpen(keyring: FieldKeyring, value: string): boolean {
  if (!isSealedText(value)) return false;
  try {
    openText(keyring, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Coluna `Json`: o valor inteiro vira UMA string JSON cifrada
 * (`"enc:v1:…"` no jsonb). O texto cifrado é o `JSON.stringify` do valor, que
 * guarda os números exatamente — ao contrário da gravação de Json do Prisma,
 * que altera até 4 ULPs de parte dos não inteiros (ver ADR-015).
 */
export function sealJson(keyring: FieldKeyring, value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new SealedValueError('Value is not JSON-serializable');
  return sealText(keyring, text);
}

/** Leitura dupla do `Json`: qualquer valor que não seja string cifrada volta como está. */
export function openJson(keyring: FieldKeyring, value: unknown): unknown {
  if (!isSealedText(value)) return value;
  const text = openText(keyring, value);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A mensagem do JSON.parse cita um trecho do texto: não pode subir para
    // log nem Sentry.
    throw new SealedValueError('Sealed JSON value does not hold valid JSON');
  }
}
