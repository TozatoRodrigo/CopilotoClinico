import { createHash } from 'crypto';

/**
 * Texto livre digitado por usuário (comentário, nota, motivo) no payload da
 * trilha de auditoria: vai o SHA-256 do texto, nunca o texto.
 *
 * `audit_log` é append-only (AUD-001) e o pedido de eliminação (LGPD) não o
 * alcança: texto livre gravado ali — e médico escreve nome de paciente em texto
 * livre — fica para sempre. O texto fica na tabela do domínio; o hash na trilha
 * prova que ele não foi trocado depois.
 *
 * Só serve para texto imprevisível. Valor curto e de formato previsível (nome
 * de arquivo, email) se reverte por dicionário — esse não entra nem como hash.
 */
export function freeTextHash(text: string | null | undefined): string | null {
  if (!text) return null;
  return createHash('sha256').update(text).digest('hex');
}
