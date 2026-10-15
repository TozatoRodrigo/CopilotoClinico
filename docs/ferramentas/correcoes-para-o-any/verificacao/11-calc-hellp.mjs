import { calculadora, resultado } from './calculadoras.mjs';
import { tabela } from './lib.mjs';

export const titulo = 'HELLP (Mississippi): TGO ≥ 70 nas classes 1 e 2, ≥ 40 na classe 3, com LDH';

/** Exames → seleções da tela, em cada versão (antes a TGO era só "> 70 sim/não"). */
function selecoes(calc, { plaquetas, ldh, tgo }) {
  const item = calc.items.find((i) => i.id === 'tgo');
  const tgoValor =
    item.options.length === 2 ? (tgo > 70 ? 1 : 0) : tgo >= 70 ? 2 : tgo >= 40 ? 1 : 0;
  const plat = plaquetas >= 150000 ? 0 : plaquetas > 100000 ? 1 : plaquetas > 50000 ? 2 : 3;
  return { platelets: plat, ldh: ldh > 600 ? 1 : 0, tgo: tgoValor };
}

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'hellp');
  const d = calculadora(depois, 'hellp');
  const casos = [
    { plaquetas: 40000, ldh: 900, tgo: 150 },
    { plaquetas: 40000, ldh: 900, tgo: 45 },
    { plaquetas: 80000, ldh: 300, tgo: 120 },
    { plaquetas: 120000, ldh: 700, tgo: 55 },
    { plaquetas: 120000, ldh: 700, tgo: 30 },
    { plaquetas: 120000, ldh: 400, tgo: 30 },
  ];
  const r = casos.map((c) => [c, resultado(a, selecoes(a, c)), resultado(d, selecoes(d, c))]);
  const linhas = r.map(([c, x, y]) => [
    `plaq ${c.plaquetas / 1000} mil, LDH ${c.ldh}, TGO ${c.tgo}`,
    x.label,
    y.label,
  ]);
  return {
    texto: tabela(['exames', 'antes', 'depois'], linhas),
    conferencias: [
      {
        nome: 'plaq 40 mil, LDH 900, TGO 150: Classe 1 nas duas versões',
        ok: r[0][1].label === r[0][2].label && r[0][2].label.includes('Classe 1'),
      },
      {
        nome: 'plaq 40 mil, LDH 900, TGO 45: antes Classe 1 ("considere parto imediato"); depois incompleta',
        ok: r[1][1].label.includes('Classe 1') && r[1][2].label === 'HELLP incompleta',
      },
      {
        nome: 'plaq 80 mil, sem LDH, TGO 120: antes Classe 2; depois incompleta',
        ok: r[2][1].label.includes('Classe 2') && r[2][2].label === 'HELLP incompleta',
      },
      {
        nome: 'plaq 120 mil, LDH 700, TGO 55: Classe 3 nas duas (TGO ≥ 40 basta na classe 3)',
        ok: r[3][1].label.includes('Classe 3') && r[3][2].label.includes('Classe 3'),
      },
      {
        nome: 'plaq 120 mil, LDH 700, TGO 30: antes Classe 3; depois incompleta',
        ok: r[4][1].label.includes('Classe 3') && r[4][2].label === 'HELLP incompleta',
      },
    ],
  };
}
