import { isIP } from 'node:net';

/** Só o Traefik da VPS entre o cliente e a API. */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

export interface TrustedProxyHops {
  hops: number;
  /** Valor da env que não era inteiro >= 0 e caiu no padrão; `null` se não houve. */
  rejected: string | null;
}

/**
 * `TRUSTED_PROXY_HOPS`: quantos proxies confiáveis acrescentam um IP ao
 * X-Forwarded-For antes da API. Ausente ou vazio = padrão sem aviso; qualquer
 * coisa que não seja inteiro >= 0 também cai no padrão, mas volta em
 * `rejected` para quem chama avisar no log.
 */
export function parseTrustedProxyHops(raw: string | undefined): TrustedProxyHops {
  if (raw === undefined || raw.trim() === '') {
    return { hops: DEFAULT_TRUSTED_PROXY_HOPS, rejected: null };
  }
  const trimmed = raw.trim();
  const hops = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(hops)) {
    return { hops: DEFAULT_TRUSTED_PROXY_HOPS, rejected: raw };
  }
  return { hops, rejected: null };
}

export interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * IP do cliente como o proxy confiável o viu.
 *
 * Cada proxy ACRESCENTA à direita do X-Forwarded-For o endereço de quem se
 * conectou a ele; tudo o que está à esquerda veio do cliente e pode ser
 * forjado. Por isso o rastreador é o N-ésimo a partir da direita, nunca o
 * primeiro: com N = 1 (só o Traefik), é o último da lista. Lista mais curta
 * que N quer dizer que todo item foi posto por proxy confiável, então vale o
 * mais à esquerda.
 *
 * N = 0 ignora o cabeçalho. Sem cabeçalho, ou com um item que não é IP na
 * posição escolhida, vale o endereço do socket: no pior caso essas
 * requisições dividem um único balde, o que restringe em vez de liberar.
 */
export function resolveClientIp(req: ClientIpRequest, trustedProxyHops: number): string {
  const socketIp = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  if (trustedProxyHops === 0) return socketIp;

  const chain = forwardedChain(req.headers['x-forwarded-for']);
  if (chain.length === 0) return socketIp;

  const candidate = chain[Math.max(0, chain.length - trustedProxyHops)];
  return candidate !== undefined && isIP(candidate) !== 0 ? candidate : socketIp;
}

/** O Node junta cabeçalhos repetidos com vírgula, mas o tipo admite array. */
function forwardedChain(header: string | string[] | undefined): string[] {
  if (header === undefined) return [];
  const joined = Array.isArray(header) ? header.join(',') : header;
  return joined
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
