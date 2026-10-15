import { tabela } from './lib.mjs';
import { drogas, HETRIN, PEDGUIDE } from './pediatria.mjs';

export const titulo = 'HETRIN Ped: volume do glucagon (glucagon-tox)';

export function rodar({ antes, depois }) {
  const a = drogas(antes, HETRIN)['glucagon-tox'];
  const d = drogas(depois, HETRIN)['glucagon-tox'];
  // O PedGuide v4 (any.app.br) já corrigiu a mesma conta no commit f6e64f1 do ANY.
  // Lido da mesma árvore do "depois", para os dois usarem o mesmo formatador.
  const v4 = drogas(depois, PEDGUIDE)['glucagon-tox'];
  const pesos = [3, 10, 20, 30, 50];
  const linhas = pesos.map((p) => [
    `${p} kg`,
    a.calc(p).mg,
    `${a.calc(p).ml} mL ${a.calc(p).mlLabel}`,
    `${d.calc(p).ml} mL ${d.calc(p).mlLabel}`,
    `${v4.calc(p).ml} mL`,
  ]);
  let iguaisAoV4 = true;
  for (let p10 = 5; p10 <= 500; p10 += 1) {
    const p = p10 / 10;
    if (d.calc(p).ml !== v4.calc(p).ml || d.calc(p).mg !== v4.calc(p).mg) iguaisAoV4 = false;
  }
  return {
    texto: tabela(['peso', 'dose (mg)', 'antes', 'depois', 'PedGuide v4'], linhas),
    conferencias: [
      {
        nome: '10 kg: antes 0,63 mL, depois 6,25 mL',
        ok: a.calc(10).ml === '0,63' && d.calc(10).ml === '6,25',
      },
      {
        nome: 'depois: volume × 0,08 mg/mL = dose, de 0,5 a 50 kg',
        ok: pesos.every(
          (p) =>
            Math.abs(Number(d.calc(p).ml.replace(',', '.')) * 0.08 - Math.min(p * 0.05, 10)) <
            0.001,
        ),
      },
      {
        nome: 'depois: igual ao PedGuide v4 em todos os pesos de 0,5 a 50 kg (passo 0,1)',
        ok: iguaisAoV4,
      },
      {
        nome: 'depois: instrução diz 0,08 mg/mL',
        ok: d.instruction.includes('(0,08 mg/mL)') && !d.instruction.includes('(0,8 mg/mL)'),
      },
    ],
  };
}
