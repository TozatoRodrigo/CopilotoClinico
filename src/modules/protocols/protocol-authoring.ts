import { Role } from '@prisma/client';

/**
 * CC-020 — quem escreve protocolo (cria rascunho, publica, cria versão nova).
 *
 * Protocolo publicado vira roteiro que o médico segue no plantão, então
 * escrever é ato de curadoria clínica: curador (`is_curator`, ADR-008) ou
 * ADMIN. Vale para o global e para o institucional; no institucional, o
 * vínculo ativo do CC-019 continua exigido à parte (ADR-009, adendo CC-020).
 * O ADR-009 não tem papel de gestor da instituição, então o médico vinculado
 * sem um desses papéis lê e roda o protocolo, mas não escreve.
 *
 * Entrada vinda do banco, não do token: tirar o papel vale no próximo pedido,
 * sem esperar o access token expirar.
 */
export type ProtocolAuthority = 'curator' | 'admin';

export interface ProtocolAuthorCandidate {
  role: Role;
  isCurator: boolean;
}

/** `null` quando não pode escrever; senão, o papel que autoriza (vai para a auditoria). */
export function protocolAuthority(
  physician: ProtocolAuthorCandidate | null,
): ProtocolAuthority | null {
  if (!physician) return null;
  if (physician.isCurator) return 'curator';
  if (physician.role === Role.ADMIN) return 'admin';
  return null;
}
