import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ANY_REDIRECTS } from './any-redirects';
import { copilotoToolPaths } from './copiloto-tools-snapshot';
import {
  InvalidSiteOriginError,
  normalizeSiteOrigin,
  renderNetlifyToml,
  renderRedirectsFile,
} from './netlify-redirects';

/**
 * Rotas que o ANY v4 publica, independentes do mapa: `Routes` de
 * v2/src/App.tsx e os arquivos de v2/public/ (bugamoreira/any-app, 95c8fba).
 * Rota nova no ANY entra aqui primeiro; o teste então exige um destino.
 */
const ANY_APP_ROUTES = [
  '/',
  '/login',
  '/block',
  '/infusion',
  '/palia',
  '/shock',
  '/dengue',
  '/tep',
  '/seda',
  '/airway',
  '/acls',
  '/ped',
  '/vm',
  '/tox',
  '/calculadoras',
  '/keto',
] as const;

const ANY_PUBLIC_FILES = [
  '/manifest.webmanifest',
  '/splash-logo.jpeg',
  '/hetrinped/',
  '/hetrinped/index.html',
  '/hetrinped/sw.js',
  '/hetrinped/manifest.webmanifest',
  '/assets/index-3f9a1c.js',
];

const SITE = 'https://copiloto.exemplo.test';
const DEPLOY_DIR = join(__dirname, '..', '..', '..', 'deploy', 'any-app');

interface ParsedRule {
  from: string;
  to: string;
  status: string;
}

function parseRedirectsFile(text: string): ParsedRule[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const [from = '', to = '', status = ''] = line.trim().split(/\s+/);
      return { from, to, status };
    });
}

/**
 * O motor do Netlify, no que importa aqui: barra final normalizada, primeira
 * regra que casa vence, `/*` casa a pasta e `:splat` leva o resto, a query
 * segue para o destino.
 */
function resolveRedirect(rules: readonly ParsedRule[], url: string): string | null {
  const [rawPath = '/', query] = url.split('?');
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  for (const rule of rules) {
    let splat: string | null = null;
    if (rule.from.endsWith('/*')) {
      const prefix = rule.from.slice(0, -2);
      if (path === prefix || prefix === '') splat = path.slice(prefix.length + 1);
      else if (path.startsWith(`${prefix}/`)) splat = path.slice(prefix.length + 1);
      else continue;
    } else if (rule.from !== path) continue;
    const target = rule.to.replace(':splat', splat ?? '');
    return query ? `${target}${target.includes('?') ? '&' : '?'}${query}` : target;
  }
  return null;
}

const rules = parseRedirectsFile(renderRedirectsFile(SITE));
const toolPaths = copilotoToolPaths();

function copilotoPath(destination: string): string | null {
  return destination.startsWith(SITE) ? new URL(destination).pathname : null;
}

describe('CC-336 — redirecionamento do ANY', () => {
  it.each(ANY_APP_ROUTES)('%s tem regra própria, para uma tela que existe no Copiloto', (route) => {
    const rule = rules.find(({ from }) => from === route);
    expect(rule, `sem regra para ${route}`).toBeDefined();
    const path = copilotoPath(resolveRedirect(rules, route) ?? '');
    expect(path && toolPaths.has(path), `${route} → ${path}`).toBe(true);
  });

  it.each(ANY_PUBLIC_FILES)('%s também tem destino (nada cai em 404)', (file) => {
    expect(resolveRedirect(rules, file)).not.toBeNull();
  });

  it('todo destino no Copiloto existe no catálogo das Ferramentas', () => {
    for (const redirect of ANY_REDIRECTS) {
      if (typeof redirect.to === 'string') expect(toolPaths.has(redirect.to)).toBe(true);
    }
  });

  it('destino fora do Copiloto só com a decisão pendente indicada', () => {
    const external = ANY_REDIRECTS.filter(({ to }) => typeof to !== 'string');
    expect(external.map(({ from }) => from)).toEqual(['/hetrinped', '/hetrinped/*']);
    for (const { to } of external) {
      expect(to).toMatchObject({ pendingDecision: 'CC-337' });
    }
  });

  it('leva cada ferramenta à equivalente (as escolhas que não são óbvias)', () => {
    expect(resolveRedirect(rules, '/keto')).toBe(`${SITE}/ferramentas/cad-ehh`);
    expect(resolveRedirect(rules, '/shock')).toBe(`${SITE}/ferramentas/choque-septico`);
    expect(resolveRedirect(rules, '/block')).toBe(`${SITE}/ferramentas/bloqueios`);
    expect(resolveRedirect(rules, '/vm')).toBe(`${SITE}/ferramentas/ventilacao-mecanica`);
    expect(resolveRedirect(rules, '/acls/')).toBe(`${SITE}/ferramentas/acls`);
  });

  it('mantém o ?drug= dos links do ANY (a tela de Infusões o aceita)', () => {
    expect(resolveRedirect(rules, '/infusion?drug=noradrenalina')).toBe(
      `${SITE}/ferramentas/infusoes?drug=noradrenalina`,
    );
  });

  it('o HETRIN segue sem login, inclusive na raiz da pasta', () => {
    expect(resolveRedirect(rules, '/hetrinped')).toBe('https://hetrinped.netlify.app/');
    expect(resolveRedirect(rules, '/hetrinped/index.html')).toBe(
      'https://hetrinped.netlify.app/index.html',
    );
  });

  it('endereço desconhecido vai para o hub, como o * do ANY', () => {
    expect(resolveRedirect(rules, '/qualquer/coisa')).toBe(`${SITE}/ferramentas`);
    expect(rules.at(-1)).toMatchObject({ from: '/*' });
  });

  it('cada caminho do ANY aparece uma vez, e toda regra é 301 forçado', () => {
    const froms = ANY_REDIRECTS.map(({ from }) => from);
    expect(new Set(froms).size).toBe(froms.length);
    expect(rules.every(({ status }) => status === '301!')).toBe(true);
  });

  it('o netlify.toml diz o mesmo que o _redirects', () => {
    const toml = renderNetlifyToml(SITE);
    const blocks = [
      ...toml.matchAll(
        /\[\[redirects\]\]\n {2}from = "([^"]+)"\n {2}to = "([^"]+)"\n {2}status = 301\n {2}force = true/g,
      ),
    ].map(([, from, to]) => ({ from, to }));
    expect(blocks).toEqual(rules.map(({ from, to }) => ({ from, to })));
  });

  it('os arquivos em deploy/any-app estão em dia com o mapa (rode pnpm any:redirects)', () => {
    const redirects = readFileSync(join(DEPLOY_DIR, '_redirects'), 'utf8');
    const site = /\((https:\/\/[^)]+)\)/.exec(redirects)?.[1];
    expect(site).toBeDefined();
    expect(redirects).toBe(renderRedirectsFile(site ?? ''));
    expect(readFileSync(join(DEPLOY_DIR, 'netlify.toml'), 'utf8')).toBe(
      renderNetlifyToml(site ?? ''),
    );
  });

  it('aceita só a origem https do Copiloto', () => {
    expect(normalizeSiteOrigin('https://copiloto.exemplo.test/')).toBe(SITE);
    for (const bad of [
      'http://copiloto.exemplo.test',
      'https://copiloto.exemplo.test/app',
      'https://copiloto.exemplo.test/?a=1',
      'copiloto.exemplo.test',
    ]) {
      expect(() => normalizeSiteOrigin(bad)).toThrow(InvalidSiteOriginError);
    }
  });
});
