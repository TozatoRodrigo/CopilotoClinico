import { calculadora, resultado } from './calculadoras.mjs';
import { opcaoPara, tabela } from './lib.mjs';

export const titulo = 'Bonacini: pontuação do escore original (ALT/AST, plaquetas 0–6, corte ≥ 8)';

/** Exames → seleções. O ANY de hoje pede AST/ALT; a versão corrigida, ALT/AST (o inverso). */
function pontuar(calc, { alt, ast, plaquetas, inr }) {
  const s = {};
  for (const item of calc.items) {
    if (item.id === 'ratio')
      s.ratio = opcaoPara(
        item,
        Number((item.label.includes('ALT/AST') ? alt / ast : ast / alt).toFixed(2)),
      ).value;
    else if (item.id === 'platelets') s.platelets = opcaoPara(item, plaquetas).value;
    else s.inr = opcaoPara(item, inr).value;
  }
  return resultado(calc, s);
}

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'bonacini');
  const d = calculadora(depois, 'bonacini');
  const casos = [
    { alt: 80, ast: 40, plaquetas: 350000, inr: 1.0 },
    { alt: 60, ast: 66, plaquetas: 150000, inr: 1.2 },
    { alt: 50, ast: 50, plaquetas: 100000, inr: 1.5 },
    { alt: 40, ast: 80, plaquetas: 90000, inr: 1.3 },
    { alt: 30, ast: 90, plaquetas: 30000, inr: 1.6 },
  ];
  const r = casos.map((c) => [c, pontuar(a, c), pontuar(d, c)]);
  const linhas = r.map(([c, x, y]) => [
    `ALT ${c.alt}, AST ${c.ast}, plaq ${c.plaquetas / 1000} mil, INR ${String(c.inr).replace('.', ',')}`,
    `${x.score} — ${x.label}`,
    `${y.score} — ${y.label}`,
  ]);
  const maximo = d.items.reduce((s, i) => s + Math.max(...i.options.map((o) => o.value)), 0);
  return {
    texto: tabela(['exames', 'antes', 'depois'], linhas),
    conferencias: [
      { nome: 'depois: escore vai de 0 a 11', ok: maximo === 11 },
      {
        nome: 'ALT 50, AST 50, plaq 100 mil, INR 1,5: antes 5 (intermediária), depois 8 (alta)',
        ok:
          r[2][1].score === 5 &&
          r[2][2].score === 8 &&
          r[2][2].label === 'Alta probabilidade de cirrose',
      },
      {
        nome: 'depois: 7 é intermediária e 8 é alta',
        ok:
          d.interpret(7).label === 'Probabilidade intermediária' &&
          d.interpret(8).label === 'Alta probabilidade de cirrose',
      },
    ],
  };
}
