import { OAuthLanding } from './_components/oauth-landing';
import { parseOAuthLandingParams } from './_components/oauth-landing-params';

/**
 * CC-334 — volta do login com Google/Microsoft. A API redireciona para cá
 * com `?status=` (e `?reason=` no erro); o resto (código MFA, cadastro com
 * CRM, vínculo com senha) vem de GET /auth/oauth/pending, nunca da URL.
 *
 * Fica sob /login para o middleware tratar como rota pública: na chegada,
 * vinda de um redirecionamento do provedor, o navegador ainda não manda os
 * cookies `SameSite=Strict` da sessão — só as chamadas feitas desta página.
 */
export default async function OAuthLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status, reason } = parseOAuthLandingParams(await searchParams);
  return <OAuthLanding status={status} reason={reason} />;
}
