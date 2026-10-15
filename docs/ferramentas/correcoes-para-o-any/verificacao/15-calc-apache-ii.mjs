import { calculadora, resultado } from './calculadoras.mjs';
import { opcaoPara, tabela } from './lib.mjs';

export const titulo = 'APACHE II: pontos de cada faixa como na tabela de Knaus (1985)';

/**
 * Pontos por faixa: [a partir de, pontos], do maior para o menor; abaixo da
 * última faixa vale `resto`.
 */
const porFaixa = (faixas, resto) => (v) => faixas.find(([min]) => v >= min)?.[1] ?? resto;

/** Tabela de Knaus et al., Crit Care Med 1985;13:818-29 (APS), só as 7 variáveis que o patch mexe. */
const KNAUS = {
  temp: porFaixa(
    [
      [41, 4],
      [39, 3],
      [38.5, 1],
      [36, 0],
      [34, 1],
      [32, 2],
      [30, 3],
    ],
    4,
  ),
  rr_val: porFaixa(
    [
      [50, 4],
      [35, 3],
      [25, 1],
      [12, 0],
      [10, 1],
      [6, 2],
    ],
    4,
  ),
  ph: porFaixa(
    [
      [7.7, 4],
      [7.6, 3],
      [7.5, 1],
      [7.33, 0],
      [7.25, 2],
      [7.15, 3],
    ],
    4,
  ),
  na_val: porFaixa(
    [
      [180, 4],
      [160, 3],
      [155, 2],
      [150, 1],
      [130, 0],
      [120, 2],
      [111, 3],
    ],
    4,
  ),
  k_val: porFaixa(
    [
      [7, 4],
      [6, 3],
      [5.5, 1],
      [3.5, 0],
      [3, 1],
      [2.5, 2],
    ],
    4,
  ),
  ht_val: porFaixa(
    [
      [60, 4],
      [50, 2],
      [46, 1],
      [30, 0],
      [20, 2],
    ],
    4,
  ),
  wbc_val: porFaixa(
    [
      [40, 4],
      [20, 2],
      [15, 1],
      [3, 0],
      [1, 2],
    ],
    4,
  ),
};
const GRADE = {
  temp: [
    28, 29.9, 30, 31, 31.9, 32, 33, 33.9, 34, 35, 36, 37, 38.4, 38.5, 38.9, 39, 40, 40.9, 41, 42,
  ],
  rr_val: [4, 5, 6, 8, 9, 10, 11, 12, 20, 24, 25, 30, 34, 35, 40, 49, 50, 60],
  ph: [
    7.0, 7.1, 7.14, 7.15, 7.2, 7.24, 7.25, 7.3, 7.32, 7.33, 7.4, 7.49, 7.5, 7.55, 7.59, 7.6, 7.65,
    7.69, 7.7, 7.8,
  ],
  na_val: [
    100, 110, 111, 115, 119, 120, 125, 129, 130, 140, 149, 150, 152, 154, 155, 157, 159, 160, 170,
    179, 180, 190,
  ],
  k_val: [
    2.0, 2.4, 2.5, 2.7, 2.9, 3.0, 3.2, 3.4, 3.5, 4.5, 5.4, 5.5, 5.7, 5.9, 6.0, 6.5, 6.9, 7.0, 7.5,
  ],
  ht_val: [15, 19.9, 20, 25, 29.9, 30, 40, 45.9, 46, 48, 49.9, 50, 55, 59.9, 60, 65],
  wbc_val: [0.5, 0.9, 1, 2, 2.9, 3, 10, 14.9, 15, 17, 19.9, 20, 30, 39.9, 40, 50],
};

/** Paciente: valores das 7 variáveis; o resto normal (PAM 80, FC 80, PaO₂ > 70, Cr 1,0, GCS 15, < 45 anos, sem doença crônica). */
function pontuar(calc, v) {
  const s = {};
  for (const item of calc.items) {
    if (item.id in KNAUS) s[item.id] = opcaoPara(item, v[item.id]).value;
    else if (item.id === 'pam_val' || item.id === 'hr_val') s[item.id] = opcaoPara(item, 80).value;
    else if (item.id === 'cr_val') s[item.id] = opcaoPara(item, 1.0).value;
    else s[item.id] = 0;
  }
  return resultado(calc, s);
}

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'apache-ii');
  const d = calculadora(depois, 'apache-ii');
  const linhas = [];
  let errosAntes = 0;
  let errosDepois = 0;
  for (const [id, valores] of Object.entries(GRADE)) {
    const ia = a.items.find((i) => i.id === id);
    const id_ = d.items.find((i) => i.id === id);
    for (const v of valores) {
      const pa = opcaoPara(ia, v).value;
      const pd = opcaoPara(id_, v).value;
      const k = KNAUS[id](v);
      if (pa !== k) {
        errosAntes += 1;
        linhas.push([id, String(v).replace('.', ','), pa, pd, k]);
      }
      if (pd !== k) errosDepois += 1;
    }
  }
  const paciente = {
    temp: 33,
    rr_val: 8,
    ph: 7.3,
    na_val: 152,
    k_val: 2.7,
    ht_val: 48,
    wbc_val: 17,
  };
  const ra = pontuar(a, paciente);
  const rd = pontuar(d, paciente);
  const total = Object.values(GRADE).reduce((s, l) => s + l.length, 0);
  return {
    texto: [
      'Valores em que o ANY de hoje pontua diferente de Knaus (variável, valor, antes, depois, Knaus):',
      tabela(['variável', 'valor', 'antes', 'depois', 'Knaus'], linhas),
      '',
      `Paciente (T 33 °C, FR 8, pH 7,30, Na 152, K 2,7, Ht 48%, leucócitos 17 mil; o resto normal):`,
      `antes ${ra.score} (${ra.label}, ${ra.action}) → depois ${rd.score} (${rd.label}, ${rd.action})`,
    ].join('\n'),
    conferencias: [
      {
        nome: `depois: as 7 variáveis pontuam como Knaus em ${total} valores testados (antes: ${errosAntes} diferentes)`,
        ok: errosDepois === 0 && errosAntes > 0,
      },
      {
        nome: 'paciente do exemplo: antes 16 (~25%), depois 11 (~15%)',
        ok: ra.score === 16 && rd.score === 11,
      },
    ],
  };
}
