// Monta a cópia temporária "antes" dos arquivos do ANY a partir da referência
// congelada, fora do repositório (CC-016).
//
// Uso (da raiz do repositório):
//   node docs/ferramentas/correcoes-para-o-any/verificacao/preparar.mjs <dir-temporário> [<clone do ANY>]
//
// Para cada arquivo de tests/any-reference/, tira o cabeçalho, confere o sha256
// declarado (o mesmo que reference-integrity.spec.ts confere) e grava o
// original em <dir-temporário>/antes/<caminho no repositório do ANY>, o caminho
// que os .patch usam. O `sw.js` do HETRIN não está na referência: ele só entra
// se o clone do ANY (branch v4, 95c8fba) for passado.
//
// Só LÊ a referência como texto; não a importa nem a altera.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const MARKER = '// ---- início do arquivo original ----\n';
const REFERENCIA = join(process.cwd(), 'tests/any-reference');
const SW_HETRIN = 'v2/public/hetrinped/sw.js';
const SW_HETRIN_SHA = '733c90fb175f3ba2b0678d127883b1dec1b892a0dbd2c87fcf522c192c9101fd';

const [destino, cloneAny] = process.argv.slice(2);
if (!destino) {
  console.error('uso: preparar.mjs <dir-temporário> [<clone do ANY>]');
  process.exit(1);
}
if (!existsSync(REFERENCIA)) {
  console.error('rode da raiz do repositório (tests/any-reference não encontrado)');
  process.exit(1);
}

const antes = join(destino, 'antes');
let total = 0;
for (const arquivo of readdirSync(REFERENCIA)) {
  if (!/\.(tsx?|html)$/.test(arquivo) || arquivo.endsWith('.spec.ts')) continue;
  const conteudo = readFileSync(join(REFERENCIA, arquivo), 'utf-8');
  const [cabecalho, original] = conteudo.split(MARKER);
  const caminho = cabecalho.match(/^\/\/ Arquivo: (\S+)/m)?.[1];
  const sha = cabecalho.match(/sha256 do original: ([0-9a-f]{64})/)?.[1];
  if (!caminho || !sha || original === undefined)
    throw new Error(`${arquivo}: cabeçalho incompleto`);
  const real = createHash('sha256').update(original, 'utf-8').digest('hex');
  if (real !== sha) throw new Error(`${arquivo}: sha256 não confere`);
  mkdirSync(dirname(join(antes, caminho)), { recursive: true });
  writeFileSync(join(antes, caminho), original);
  total += 1;
}

if (cloneAny) {
  const origem = join(cloneAny, SW_HETRIN);
  const sha = createHash('sha256').update(readFileSync(origem)).digest('hex');
  if (sha !== SW_HETRIN_SHA) throw new Error(`${SW_HETRIN}: sha256 diferente do v4 95c8fba`);
  mkdirSync(dirname(join(antes, SW_HETRIN)), { recursive: true });
  copyFileSync(origem, join(antes, SW_HETRIN));
  total += 1;
}

console.log(`${total} arquivos do ANY em ${antes}`);
