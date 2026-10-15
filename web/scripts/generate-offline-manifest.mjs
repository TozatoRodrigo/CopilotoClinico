#!/usr/bin/env node
/**
 * CC-322 — lista de pré-cache das Ferramentas, gerada depois do `next build`.
 *
 * O service worker (public/sw.js) baixa tudo o que está aqui na primeira vez
 * que o app abre com sinal: as páginas pré-renderizadas de /ferramentas/** e
 * os arquivos de /_next/static que elas usam (os chunks do motor clínico
 * entre eles). Com isso ACLS, Pediatria, Infusões, Calculadoras e as demais
 * ferramentas abrem e calculam sem internet.
 *
 * Saída: public/ferramentas-offline.json (fora do git; a imagem do web copia
 * public/ depois do build). Com NEXT_PUBLIC_FERRAMENTAS desligada não há rota
 * de ferramenta: o arquivo é apagado e o service worker não pré-carrega nada.
 *
 * `version` é o hash do conteúdo pré-carregado: muda a cada build que muda
 * alguma página ou chunk, e é o que o service worker compara ao voltar a ter
 * sinal para saber se precisa atualizar o cache.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = join(WEB, '.next');
const OUT = join(WEB, 'public', 'ferramentas-offline.json');

const STATIC_REFERENCE = /\/_next\/static\/[A-Za-z0-9_\-./~%]+/g;
const FLIGHT_REFERENCE = /"(static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~%]+)"/g;
const CSS_URL = /url\((?:"|')?(\/_next\/static\/[^)"']+)(?:"|')?\)/g;

/** Rotas pré-renderizadas da área Ferramentas, em ordem estável. */
export function toolRoutes(prerenderManifest) {
  return Object.keys(prerenderManifest.routes ?? {})
    .filter((route) => route === '/ferramentas' || route.startsWith('/ferramentas/'))
    .sort();
}

/** Arquivos de /_next/static citados num HTML, num payload RSC ou num CSS. */
export function staticReferences(text) {
  const found = new Set();
  for (const [reference] of text.matchAll(STATIC_REFERENCE)) found.add(reference);
  for (const [, reference] of text.matchAll(FLIGHT_REFERENCE)) found.add(`/_next/${reference}`);
  for (const [, reference] of text.matchAll(CSS_URL)) found.add(reference);
  // O endereço do arquivo não leva parâmetro nem âncora.
  return [...found].map((reference) => reference.replace(/[?#].*$/, ''));
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function staticFile(url) {
  return join(NEXT, 'static', decodeURIComponent(url.slice('/_next/static/'.length)));
}

function main() {
  const manifestPath = join(NEXT, 'prerender-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('generate-offline-manifest: rode depois do `next build`.');
    process.exit(1);
  }
  const routes = toolRoutes(JSON.parse(readFileSync(manifestPath, 'utf-8')));
  if (routes.length === 0) {
    rmSync(OUT, { force: true });
    console.log('Ferramentas desligadas: sem pré-cache offline.');
    return;
  }

  const hash = createHash('sha256');
  const assets = new Set();
  for (const route of routes) {
    for (const extension of ['.html', '.rsc']) {
      const file = join(NEXT, 'server', 'app', `${route.slice(1)}${extension}`);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf-8');
      hash.update(`${route}${extension}\n${text}`);
      for (const reference of staticReferences(text)) assets.add(reference);
    }
  }

  // Os CSS citam as fontes (/_next/static/media): entram também.
  for (const asset of [...assets]) {
    if (!asset.endsWith('.css')) continue;
    const file = staticFile(asset);
    if (isFile(file)) {
      for (const reference of staticReferences(readFileSync(file, 'utf-8'))) assets.add(reference);
    }
  }

  const existing = [...assets].filter((asset) => isFile(staticFile(asset))).sort();
  for (const asset of existing) hash.update(asset);

  const manifest = {
    version: hash.digest('hex').slice(0, 12),
    generatedAt: new Date().toISOString(),
    routes,
    assets: existing,
  };
  writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  const bytes = [
    ...routes.map((route) => join(NEXT, 'server', 'app', `${route.slice(1)}.html`)),
    ...existing.map(staticFile),
  ]
    .filter(isFile)
    .reduce((total, file) => total + readFileSync(file).length, 0);
  console.log(
    `Ferramentas offline: ${routes.length} páginas, ${existing.length} arquivos estáticos, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB, versão ${manifest.version}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
