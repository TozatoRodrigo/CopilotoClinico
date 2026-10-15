/**
 * CC-336 — Gera o `_redirects` e o `netlify.toml` do ANY (any.app.br →
 * Copiloto, 301 por ferramenta) a partir de src/shared/any-migration/any-redirects.ts.
 *
 * Uso:
 *   pnpm any:redirects --site https://copiloto.servidortozato.cloud [--saida deploy/any-app]
 *
 * Os arquivos em deploy/any-app/ são conferidos pelo teste
 * (any-redirects.spec.ts): mudou o mapa ou o domínio, gere de novo e faça
 * commit. Como publicar no Netlify: docs/any/migracao-e-desligamento.md.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseArgs } from 'util';
import {
  renderNetlifyToml,
  renderRedirectsFile,
} from '../src/shared/any-migration/netlify-redirects';

function main(): void {
  const { values } = parseArgs({
    options: {
      site: { type: 'string' },
      saida: { type: 'string', default: 'deploy/any-app' },
    },
  });
  if (!values.site) throw new Error('Informe --site <origem https do Copiloto>');

  const outDir = resolve(values.saida ?? 'deploy/any-app');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, '_redirects'), renderRedirectsFile(values.site));
  writeFileSync(join(outDir, 'netlify.toml'), renderNetlifyToml(values.site));
  console.log(`Gerados ${join(outDir, '_redirects')} e ${join(outDir, 'netlify.toml')}.`);
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
