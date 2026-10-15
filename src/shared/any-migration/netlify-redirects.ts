import { ANY_REDIRECTS, ANY_REDIRECTS_VERSION, type AnyRedirect } from './any-redirects';

/**
 * CC-336 — gera, a partir de `ANY_REDIRECTS`, o `_redirects` e o
 * `netlify.toml` que vão para o repositório do ANY. Os dois dizem a mesma
 * coisa; use um só (ver docs/any/migracao-e-desligamento.md).
 *
 * Toda regra é 301 forçado (`!` / `force = true`): publicado por cima do
 * build do ANY, o `index.html` e os arquivos de `public/` existem, e sem
 * forçar o Netlify os serviria no lugar do redirecionamento.
 */

export interface RedirectRule {
  from: string;
  to: string;
  status: 301;
  force: true;
  comment: string;
}

export class InvalidSiteOriginError extends Error {
  constructor(raw: string) {
    super(`Endereço do Copiloto inválido: "${raw}". Use só a origem https, sem caminho.`);
    this.name = 'InvalidSiteOriginError';
  }
}

/** `https://copiloto.exemplo` (sem barra no fim). Recusa http, caminho, query e hash. */
export function normalizeSiteOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidSiteOriginError(raw);
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new InvalidSiteOriginError(raw);
  }
  if (url.username || url.password) throw new InvalidSiteOriginError(raw);
  return url.origin;
}

function destination(site: string, redirect: AnyRedirect): string {
  return typeof redirect.to === 'string' ? `${site}${redirect.to}` : redirect.to.url;
}

function comment(redirect: AnyRedirect): string {
  const pending =
    typeof redirect.to === 'string' ? '' : ` [provisório: decisão ${redirect.to.pendingDecision}]`;
  return `${redirect.anyName}${redirect.note ? ` — ${redirect.note}` : ''}${pending}`;
}

export function buildRedirectRules(
  rawSite: string,
  redirects: readonly AnyRedirect[] = ANY_REDIRECTS,
): RedirectRule[] {
  const site = normalizeSiteOrigin(rawSite);
  return redirects.map((redirect) => ({
    from: redirect.from,
    to: destination(site, redirect),
    status: 301,
    force: true,
    comment: comment(redirect),
  }));
}

function header(site: string, file: string): string[] {
  return [
    `# CC-336 — ANY App → Copiloto Clínico (${site}). ${file} gerado por`,
    `# \`pnpm any:redirects\` a partir de src/shared/any-migration/any-redirects.ts`,
    `# (versão ${ANY_REDIRECTS_VERSION}) do repositório do Copiloto. Não edite à mão: mude o mapa e gere de novo.`,
    '# Primeira regra que casa vence; a query string segue para o destino.',
  ];
}

export function renderRedirectsFile(
  rawSite: string,
  redirects: readonly AnyRedirect[] = ANY_REDIRECTS,
): string {
  const site = normalizeSiteOrigin(rawSite);
  const rules = buildRedirectRules(site, redirects);
  const width = Math.max(...rules.map((rule) => rule.from.length));
  const lines = [...header(site, '_redirects'), ''];
  for (const rule of rules) {
    lines.push(`# ${rule.comment}`);
    lines.push(`${rule.from.padEnd(width)}  ${rule.to}  ${rule.status}!`);
  }
  return `${lines.join('\n')}\n`;
}

/** Os valores do mapa são caminhos e URLs; aspas ou barra invertida seriam erro de digitação. */
function tomlString(value: string): string {
  if (/["\\\n]/.test(value)) throw new Error(`Valor inesperado no mapa do ANY: ${value}`);
  return `"${value}"`;
}

export function renderNetlifyToml(
  rawSite: string,
  redirects: readonly AnyRedirect[] = ANY_REDIRECTS,
): string {
  const site = normalizeSiteOrigin(rawSite);
  const rules = buildRedirectRules(site, redirects);
  const lines = [...header(site, 'netlify.toml')];
  for (const rule of rules) {
    lines.push(
      '',
      `# ${rule.comment}`,
      '[[redirects]]',
      `  from = ${tomlString(rule.from)}`,
      `  to = ${tomlString(rule.to)}`,
      `  status = ${rule.status}`,
      '  force = true',
    );
  }
  return `${lines.join('\n')}\n`;
}
