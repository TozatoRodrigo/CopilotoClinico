import { calculadora, resultado } from './calculadoras.mjs';
import { tabela } from './lib.mjs';

export const titulo = 'CIWA-Ar: náusea, tremor, sudorese, ansiedade e agitação de 0 a 7';

const CINCO = ['náusea', 'tremor', 'sweat', 'anxiety', 'agitation'];

/**
 * Nota que o médico dá (0–7) → opção da tela. No ANY de hoje só há 0, 2, 5 e 7:
 * a nota 1, 2 ou 3 cai na opção "(1-3)", 4–6 na "(4-6)".
 */
function opcao(item, nota) {
  const exata = item.options.find((o) => o.value === nota && !/\(\d-\d\)/.test(o.label));
  if (exata) return exata.value;
  const faixa = item.options.find((o) => {
    const m = o.label.match(/\((\d)-(\d)\)/);
    return m && nota >= Number(m[1]) && nota <= Number(m[2]);
  });
  return (faixa ?? item.options.find((o) => o.value === nota)).value;
}

function pontuar(calc, notas) {
  const s = {};
  for (const item of calc.items) s[item.id] = opcao(item, notas[item.id] ?? 0);
  return resultado(calc, s);
}

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'ciwa-ar');
  const d = calculadora(depois, 'ciwa-ar');
  const todos = (n, extra = {}) => ({
    ...Object.fromEntries(CINCO.map((id) => [id, n])),
    ...extra,
  });
  const casos = [
    ['tremor 1 (o resto 0)', { tremor: 1 }],
    ['nota 1 nos cinco itens', todos(1)],
    [
      'nota 3 nos cinco itens + cefaleia 3 + orientação 2',
      todos(3, { headache: 3, orientation: 2 }),
    ],
    ['nota 4 nos cinco itens', todos(4)],
    ['nota 6 nos cinco itens', todos(6)],
  ];
  const r = casos.map(([nome, notas]) => [nome, pontuar(a, notas), pontuar(d, notas)]);
  const linhas = r.map(([nome, x, y]) => [
    nome,
    `${x.score} — ${x.label}`,
    `${y.score} — ${y.label}`,
  ]);
  const opcoesDepois = CINCO.map((id) =>
    d.items
      .find((i) => i.id === id)
      .options.map((o) => o.value)
      .join(','),
  );
  return {
    texto: tabela(['notas (Sullivan 1989, 0–7 por item)', 'antes', 'depois'], linhas),
    conferencias: [
      {
        nome: 'depois: os cinco itens têm as notas 0,1,2,3,4,5,6,7',
        ok: opcoesDepois.every((o) => o === '0,1,2,3,4,5,6,7'),
      },
      {
        nome: 'nota 1 nos cinco itens: antes 10 (moderada, sugere benzodiazepínico), depois 5 (leve)',
        ok: r[1][1].score === 10 && r[1][2].score === 5 && r[1][2].label === 'Abstinência leve',
      },
      {
        nome: 'nota 3 nos cinco + cefaleia 3 + orientação 2: antes 15 (moderada), depois 20 (grave)',
        ok: r[2][1].score === 15 && r[2][2].score === 20 && r[2][2].label === 'Abstinência grave',
      },
      {
        nome: 'depois: total = soma das notas dadas',
        ok: r.every(
          ([, , y], i) => y.score === Object.values(casos[i][1]).reduce((s, n) => s + n, 0),
        ),
      },
    ],
  };
}
