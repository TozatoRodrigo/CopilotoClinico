import { createHash } from 'crypto';

/**
 * Chave de `login_security_states` (bloqueio por tentativas): SHA-256 do
 * e-mail normalizado. Fica num lugar só porque a eliminação LGPD também
 * precisa dela — a linha pode ter `physician_id` nulo (tentativa com o e-mail
 * digitado de outro jeito) e só é encontrada pelo hash.
 */
export function loginIdentifierHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
