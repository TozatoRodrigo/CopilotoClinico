import { calculadora, resultado } from './calculadoras.mjs';
import { opcaoPara, tabela } from './lib.mjs';

export const titulo = 'NEWS2: 3 pontos em um único parâmetro pedem resposta urgente';

/** Sinais vitais → seleções da tela (O₂ e consciência por escolha direta). */
function selecoes(calc, v) {
  const s = {};
  for (const item of calc.items) {
    if (item.id === 'o2') s.o2 = v.o2 ? 2 : 0;
    else if (item.id === 'consciousness') s.consciousness = v.acvpu === 'A' ? 0 : 3;
    else s[item.id] = opcaoPara(item, v[item.id]).value;
  }
  return s;
}

const NORMAL = { rr: 16, spo2: 97, o2: false, temp: 37, sbp: 120, hr: 80, acvpu: 'A' };

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'news2');
  const d = calculadora(depois, 'news2');
  const casos = [
    ['tudo normal', NORMAL],
    ['FR 7 (o resto normal)', { ...NORMAL, rr: 7 }],
    ['confusão nova (o resto normal)', { ...NORMAL, acvpu: 'C' }],
    ['PAS 88 (o resto normal)', { ...NORMAL, sbp: 88 }],
    ['FC 95 e T 38,5 °C', { ...NORMAL, hr: 95, temp: 38.5 }],
    ['FR 22, SpO₂ 93%, FC 95', { ...NORMAL, rr: 22, spo2: 93, hr: 95 }],
    ['FR 26, SpO₂ 91%, FC 112', { ...NORMAL, rr: 26, spo2: 91, hr: 112 }],
  ];
  const linhas = [];
  const r = {};
  for (const [nome, v] of casos) {
    const ra = resultado(a, selecoes(a, v));
    const rd = resultado(d, selecoes(d, v));
    r[nome] = [ra, rd];
    linhas.push([
      nome,
      ra.score,
      `${ra.label} — ${ra.action.replace(/^NEWS2: \d+\. /, '')}`,
      `${rd.label} — ${rd.action.replace(/^NEWS2: \d+\. /, '')}`,
    ]);
  }
  const fr7 = r['FR 7 (o resto normal)'];
  return {
    texto: tabela(['caso', 'NEWS2', 'antes', 'depois'], linhas),
    conferencias: [
      {
        nome: 'FR 7 isolada (NEWS2 3): antes "Baixo risco", depois resposta urgente',
        ok: fr7[0].label === 'Baixo risco' && fr7[1].label.startsWith('Risco baixo-médio'),
      },
      {
        nome: 'confusão nova e PAS 88 isoladas também viram resposta urgente',
        ok: ['confusão nova (o resto normal)', 'PAS 88 (o resto normal)'].every((k) =>
          r[k][1].label.startsWith('Risco baixo-médio'),
        ),
      },
      {
        nome: 'soma igual antes e depois (os pontos não mudaram)',
        ok: Object.values(r).every(([x, y]) => x.score === y.score),
      },
      {
        nome: 'NEWS2 ≥ 7 continua "Alto risco"',
        ok: r['FR 26, SpO₂ 91%, FC 112'][1].label === 'Alto risco',
      },
    ],
  };
}
