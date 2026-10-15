import { calculadora } from './calculadoras.mjs';

export const titulo =
  'GRACE: referência da tabela de pontos (Granger 2003, mortalidade intra-hospitalar)';

export function rodar({ antes, depois }) {
  const a = calculadora(antes, 'grace-score');
  const d = calculadora(depois, 'grace-score');
  let iguais = true;
  for (let i = 0; i < 1000; i += 1) {
    const v = {
      age: 18 + ((i * 7) % 90),
      hr: 30 + ((i * 13) % 200),
      sbp: 60 + ((i * 11) % 200),
      creatinine: 0.3 + ((i * 17) % 50) / 10,
      killip: [0, 20, 39, 59][i % 4],
      arrest: (i % 5 === 0) * 39,
      stdev: (i % 3 === 0) * 28,
      troponin: (i % 2) * 14,
    };
    if (
      a.formula(v) !== d.formula(v) ||
      a.interpret(a.formula(v)).label !== d.interpret(d.formula(v)).label
    )
      iguais = false;
  }
  return {
    texto: `Referência antes: ${a.reference}\nReferência depois: ${d.reference}\nCortes da faixa (iguais): ≤ 108 baixo; 109–140 intermediário; > 140 alto (mortalidade intra-hospitalar).`,
    conferencias: [
      {
        nome: 'referência passa a ser Granger 2003 (Arch Intern Med)',
        ok: d.reference.startsWith('Granger CB') && a.reference.startsWith('Fox KA'),
      },
      { nome: 'pontos e faixas iguais em 1.000 combinações', ok: iguais },
    ],
  };
}
