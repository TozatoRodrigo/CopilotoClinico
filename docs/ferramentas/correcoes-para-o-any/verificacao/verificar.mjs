// Aplica cada .patch numa cópia temporária dos arquivos do ANY e roda a
// verificação dele, mostrando o antes e o depois (CC-016).
//
// Uso (da raiz do repositório):
//   node docs/ferramentas/correcoes-para-o-any/verificacao/preparar.mjs <tmp> [<clone do ANY>]
//   node docs/ferramentas/correcoes-para-o-any/verificacao/verificar.mjs <tmp>
//
// <tmp>/antes é a cópia montada pelo preparar.mjs. Para cada patch NN, o
// script copia <tmp>/antes para <tmp>/NN, aplica só aquele patch (`patch -p1`)
// e roda NN-*.mjs desta pasta. No fim aplica todos juntos em <tmp>/todos e
// confere cada patch de novo, agora como "todos menos NN" × "todos": o efeito
// de cada um continua o mesmo quando os outros já estão aplicados.
// Sai com código 1 se algum patch não aplicar ou alguma conferência falhar.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PATCHES = dirname(AQUI);
const tmp = process.argv[2];
if (!tmp || !existsSync(join(tmp, 'antes'))) {
  console.error('uso: verificar.mjs <tmp>  (rode antes o preparar.mjs)');
  process.exit(1);
}
const antes = join(tmp, 'antes');

const patches = readdirSync(PATCHES)
  .filter((f) => /^\d\d-.*\.patch$/.test(f))
  .sort();
const verificacoes = readdirSync(AQUI)
  .filter((f) => /^(\d\d|info)-.*\.mjs$/.test(f))
  .sort();
let falhas = 0;

function aplicar(destino, patch) {
  execFileSync('patch', ['-p1', '-s', '-d', destino, '-i', join(PATCHES, patch)], {
    stdio: 'pipe',
  });
}

async function rodar(arquivo, depois, mostrar, base = antes) {
  const mod = await import(join(AQUI, arquivo));
  const r = await mod.rodar({ antes: base, depois });
  if (mostrar) console.log(`\n### ${arquivo.replace('.mjs', '')} — ${mod.titulo}\n\n${r.texto}\n`);
  for (const c of r.conferencias) {
    if (mostrar || !c.ok) console.log(`${c.ok ? 'OK    ' : 'FALHOU'} ${c.nome}`);
    if (!c.ok) falhas += 1;
  }
}

// 1. Cada patch sozinho
for (const patch of patches) {
  const nn = patch.slice(0, 2);
  const destino = join(tmp, nn);
  rmSync(destino, { recursive: true, force: true });
  cpSync(antes, destino, { recursive: true });
  try {
    aplicar(destino, patch);
  } catch (e) {
    console.log(`FALHOU ${patch} não aplica: ${e.stderr ?? e.message}`);
    falhas += 1;
    continue;
  }
  const verificacao = verificacoes.find((v) => v.startsWith(`${nn}-`));
  if (!verificacao) {
    console.log(`FALHOU ${patch} sem verificação`);
    falhas += 1;
    continue;
  }
  await rodar(verificacao, destino, true);
}

// 2. Achados sem patch (só leitura do antes)
for (const info of verificacoes.filter((v) => v.startsWith('info-')))
  await rodar(info, antes, true);

// 3. Todos juntos
const todos = join(tmp, 'todos');
rmSync(todos, { recursive: true, force: true });
cpSync(antes, todos, { recursive: true });
for (const patch of patches) {
  try {
    aplicar(todos, patch);
  } catch (e) {
    console.log(`FALHOU ${patch} não aplica junto com os anteriores: ${e.stderr ?? e.message}`);
    falhas += 1;
  }
}
console.log(
  '\n### Todos os patches aplicados juntos (cada um conferido como "todos menos ele" × "todos")',
);
for (const patch of patches) {
  const nn = patch.slice(0, 2);
  const v = verificacoes.find((x) => x.startsWith(`${nn}-`));
  if (!v) continue;
  const semEle = join(tmp, `todos-sem-${nn}`);
  rmSync(semEle, { recursive: true, force: true });
  cpSync(antes, semEle, { recursive: true });
  for (const outro of patches) if (outro !== patch) aplicar(semEle, outro);
  await rodar(v, todos, false, semEle);
  rmSync(semEle, { recursive: true, force: true });
}
console.log(
  falhas === 0
    ? `\n${patches.length} patches aplicados e conferidos, sozinhos e juntos.`
    : `\n${falhas} falha(s).`,
);
process.exit(falhas === 0 ? 0 : 1);
