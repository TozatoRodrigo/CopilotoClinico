import type {
  LEGAL_ACCEPTANCE_PATH as ContractAcceptancePath,
  TERMS_ACCEPTANCE_REQUIRED_STATUS as ContractAcceptanceRequiredStatus,
} from '@contracts/legal';

/**
 * CC-905 — a tela de aceite dos termos e o status com que a API a exige. Sem
 * React: o api-client também usa, ao receber 428. Conferidos contra o
 * contrato em tempo de compilação; o import é só de tipo porque o build do
 * web não empacota código de ../src.
 */
export const LEGAL_ACCEPTANCE_PATH: typeof ContractAcceptancePath = '/aceite-termos';
export const TERMS_ACCEPTANCE_REQUIRED_STATUS: typeof ContractAcceptanceRequiredStatus = 428;

const DEFAULT_RETURN_PATH = '/dashboard';

/** `/aceite-termos?from=/encounters` — de onde o médico voltará depois do aceite. */
export function legalAcceptanceHref(from: string): string {
  const returnPath = safeReturnPath(from);
  if (returnPath === DEFAULT_RETURN_PATH) return LEGAL_ACCEPTANCE_PATH;
  return `${LEGAL_ACCEPTANCE_PATH}?from=${encodeURIComponent(returnPath)}`;
}

/**
 * Só um caminho interno do app: `//outro-site`, URL absoluta, `\` ou a própria
 * tela de aceite viram o Plantão. Evita redirecionamento aberto pelo `from`.
 */
export function safeReturnPath(from: string | null | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) {
    return DEFAULT_RETURN_PATH;
  }
  if (from === LEGAL_ACCEPTANCE_PATH || from.startsWith(`${LEGAL_ACCEPTANCE_PATH}?`)) {
    return DEFAULT_RETURN_PATH;
  }
  return from;
}
