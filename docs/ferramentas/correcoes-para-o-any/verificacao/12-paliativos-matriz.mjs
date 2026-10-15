import { avaliar, carregarModulo, entre, ler } from './lib.mjs';

export const titulo =
  'Paliativos: matriz de compatibilidade da hipodermóclise com a diagonal no lugar';

const DADO = 'v2/src/data/paliaData.ts';
const TELA = 'v2/src/pages/PaliaPath.tsx';

/** A matriz como a tela mostra: roda a expressão das células de cada linha da própria tela. */
function matrizNaTela(raiz) {
  const { compatHeaders, compatRows } = carregarModulo(ler(raiz, DADO), 'paliaData.ts');
  const bloco = entre(ler(raiz, TELA), '{compatRows.map((row, i) => (', '</tbody>');
  const celulas = bloco.match(/\{(\S.*?)\.map\(\(c, j\) =>/)[1];
  const linhas = compatRows.map((row, i) => avaliar('', { row, i }, celulas));
  return { colunas: compatHeaders, linhas, drogas: compatRows.map((r) => r.drug) };
}

function analisar({ colunas, linhas }) {
  const n = colunas.length;
  const v = (i, j) => linhas[i][j] ?? '(vazio)';
  const discordantes = [];
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      const a = v(i, j);
      const b = v(j, i);
      if (['C', 'I'].includes(a) && ['C', 'I'].includes(b) && a !== b)
        discordantes.push(`${colunas[i]}×${colunas[j]} ${a}/${b}`);
    }
  const dex = colunas.indexOf('DEX');
  return {
    discordantes,
    colunaDex: linhas.map((l, i) => (i === dex ? '—' : v(i, dex))).join(''),
    diagonal: linhas.map((_, i) => v(i, i)).join(''),
  };
}

export function rodar({ antes, depois }) {
  const a = analisar(matrizNaTela(antes));
  const d = analisar(matrizNaTela(depois));
  const m = matrizNaTela(depois);
  const grade = [
    `       ${m.colunas.map((c) => c.padEnd(3)).join(' ')}`,
    ...m.linhas.map(
      (l, i) => `${m.colunas[i].padEnd(6)} ${l.map((c) => String(c).padEnd(3)).join(' ')}`,
    ),
  ];
  const texto = [
    `Pares discordantes (A×B ≠ B×A): antes ${a.discordantes.length}, depois ${d.discordantes.length}.`,
    `Coluna DEX: antes "${a.colunaDex}", depois "${d.colunaDex}".`,
    `Diagonal (droga com ela mesma): antes "${a.diagonal}", depois "${d.diagonal}".`,
    `Discordâncias que ficam depois (precisam da fonte, Azevedo e Barbosa): ${d.discordantes.join('; ')}.`,
    '',
    'Matriz como fica na tela depois do patch:',
    ...grade,
  ].join('\n');
  return {
    texto,
    conferencias: [
      {
        nome: 'antes: 37 pares discordantes (o número que o teste do Copiloto trava)',
        ok: a.discordantes.length === 37,
      },
      {
        nome: 'depois: 12 pares discordantes, todos com octreotide ou tramadol',
        ok: d.discordantes.length === 12 && d.discordantes.every((p) => /OCT|TRA/.test(p)),
      },
      {
        nome: 'depois: coluna DEX toda "I" (como diz o aviso da própria tela)',
        ok: /^I+—?I*$/.test(d.colunaDex) && d.colunaDex.replace('—', '').length === 14,
      },
      {
        nome: 'depois: diagonal sem "I" (droga incompatível com ela mesma)',
        ok: !d.diagonal.includes('I'),
      },
      { nome: 'dado (paliaData.ts) não mudou', ok: ler(antes, DADO) === ler(depois, DADO) },
    ],
  };
}
