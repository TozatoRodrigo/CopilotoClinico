import type { FastifyReply } from 'fastify';

export interface RequestWithIp {
  ip?: string;
  ips?: string[];
}

export const COOKIE_BASE = {
  httpOnly: true,
  sameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'none') as 'strict' | 'none',
  path: '/',
  secure: true,
};

export function extractIp(req: RequestWithIp): string | undefined {
  return (req.ips?.[0] ?? req.ip) || undefined;
}

/**
 * Reads the `exp` claim straight off the JWT payload (no signature check
 * needed — we just minted this token ourselves) so the cookie's own
 * lifetime can be made to match it.
 */
function jwtExpirySeconds(token: string): number | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    if (!decoded.exp) return undefined;
    return Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
  } catch {
    return undefined;
  }
}

export function setAuthCookies(res: FastifyReply, accessToken: string, refreshToken: string) {
  // Without an explicit maxAge these were browser *session* cookies — they
  // stayed present (and looked "authenticated" to the edge middleware,
  // which only checks cookie presence) long after the JWT inside had
  // actually expired server-side. That mismatch was producing a redirect
  // ping-pong between /login and /dashboard once a session ran past the
  // access token's real lifetime. Matching the cookie's own lifetime to
  // the token's `exp` claim keeps both expiring together.
  res.setCookie('access_token', accessToken, {
    ...COOKIE_BASE,
    maxAge: jwtExpirySeconds(accessToken),
  });
  res.setCookie('refresh_token', refreshToken, {
    ...COOKIE_BASE,
    maxAge: jwtExpirySeconds(refreshToken),
  });
}

export function clearAuthCookies(res: FastifyReply) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}
