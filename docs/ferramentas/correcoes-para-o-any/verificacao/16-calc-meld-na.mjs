import { calculadora } from './calculadoras.mjs';
import { tabela } from './lib.mjs';

export const titulo = 'MELD-Na: ajuste pelo sódio só com MELD > 11 (OPTN/UNOS)';

const meldSemNa = ({ bilirubin, inr, creatinine }) => {
  const cr = Math.min(4, Math.max(1, creatinine));
  return Math.round(
    10 *
      (0.957 * Math.log(cr) +
        0.378 * Math.log(Math.max(1, bilirubin)) +
        1.12 * Math.log(Math.max(1, inr)) +
        0.643),
  );
};

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'meld-na');
  const d = calculadora(depois, 'meld-na');
  const casos = [
    { bilirubin: 1, inr: 1, creatinine: 1, sodium: 125 },
    { bilirubin: 1, inr: 1, creatinine: 1, sodium: 137 },
    { bilirubin: 1.5, inr: 1.2, creatinine: 1, sodium: 128 },
    { bilirubin: 2, inr: 1.3, creatinine: 1, sodium: 128 },
    { bilirubin: 2, inr: 1.5, creatinine: 1.1, sodium: 128 },
    { bilirubin: 3, inr: 1.8, creatinine: 1.5, sodium: 128 },
  ];
  const br = (n) => String(n).replace('.', ',');
  const linhas = casos.map((c) => [
    `bili ${br(c.bilirubin)}, INR ${br(c.inr)}, Cr ${br(c.creatinine)}, Na ${c.sodium}`,
    meldSemNa(c),
    a.formula(c),
    d.formula(c),
  ]);
  let iguaisAcimaDe11 = true;
  let semAjusteAte11 = true;
  for (let i = 0; i < 2000; i += 1) {
    const c = {
      bilirubin: 0.3 + (i % 37) * 0.4,
      inr: 0.9 + (i % 23) * 0.12,
      creatinine: 0.5 + (i % 17) * 0.25,
      sodium: 120 + (i % 21),
    };
    if (meldSemNa(c) > 11 && a.formula(c) !== d.formula(c)) iguaisAcimaDe11 = false;
    if (meldSemNa(c) <= 11 && d.formula(c) !== Math.max(6, meldSemNa(c))) semAjusteAte11 = false;
  }
  return {
    texto: tabela(['exames', 'MELD (sem Na)', 'MELD-Na antes', 'MELD-Na depois'], linhas),
    conferencias: [
      {
        nome: 'bili 1, INR 1, Cr 1, Na 125: antes 19, depois 6',
        ok: a.formula(casos[0]) === 19 && d.formula(casos[0]) === 6,
      },
      { nome: 'MELD > 11: igual ao antes (2.000 combinações)', ok: iguaisAcimaDe11 },
      { nome: 'MELD ≤ 11: MELD-Na = MELD, sem ajuste (2.000 combinações)', ok: semAjusteAte11 },
    ],
  };
}
