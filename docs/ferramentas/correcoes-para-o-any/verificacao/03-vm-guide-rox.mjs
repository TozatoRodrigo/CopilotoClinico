import { carregarModulo, ler, tabela } from './lib.mjs';

export const titulo = 'VM Guide: índice ROX com a FiO₂ em fração';

const VM = 'v2/src/data/vmData.ts';

export function rodar({ antes, depois }) {
  const a = carregarModulo(ler(antes, VM), 'vmData.ts');
  const d = carregarModulo(ler(depois, VM), 'vmData.ts');
  // [SpO₂ %, FiO₂ como digitada, FR]
  const casos = [
    [94, 0.5, 22],
    [94, 50, 22],
    [96, 0.4, 20],
    [88, 0.6, 30],
    [90, 0.8, 35],
  ];
  const fmt = (r) =>
    `${r.toFixed(2).replace('.', ',')} (${r >= 4.88 ? 'baixo risco' : r >= 3.85 ? 'intermediário' : 'alto risco — considere intubação'})`;
  const linhas = casos.map(([s, f, fr]) => [
    `SpO₂ ${s}%, FiO₂ ${String(f).replace('.', ',')}, FR ${fr}`,
    fmt(a.calcROX(s, f, fr)),
    fmt(d.calcROX(s, f, fr)),
  ]);
  // Roca 2019: ROX = (SpO₂ / FiO₂ em fração) / FR
  const roca = (s, f, fr) => s / (f > 1 ? f / 100 : f) / fr;
  let maiorAntes = 0;
  for (let s = 70; s <= 100; s += 1)
    for (let f = 21; f <= 100; f += 1)
      for (let fr = 2; fr <= 60; fr += 1)
        maiorAntes = Math.max(maiorAntes, a.calcROX(s, f / 100, fr));
  const iguaisRoca = casos.every(
    ([s, f, fr]) => Math.abs(d.calcROX(s, f, fr) - roca(s, f, fr)) < 1e-9,
  );
  return {
    texto: `${tabela(['entrada', 'antes', 'depois'], linhas)}\n\nMaior ROX possível antes (SpO₂ 70–100, FiO₂ 0,21–1,0, FR ≥ 2): ${maiorAntes.toFixed(2).replace('.', ',')} — todo paciente caía em "alto risco".`,
    conferencias: [
      {
        nome: 'SpO₂ 94%, FiO₂ 0,5, FR 22: antes 0,09; depois 8,55',
        ok:
          a.calcROX(94, 0.5, 22).toFixed(2) === '0.09' &&
          d.calcROX(94, 0.5, 22).toFixed(2) === '8.55',
      },
      { nome: 'depois: igual à fórmula de Roca nos casos', ok: iguaisRoca },
      {
        nome: 'depois: FiO₂ digitada em % (50) dá o mesmo que em fração (0,5)',
        ok: d.calcROX(94, 50, 22) === d.calcROX(94, 0.5, 22),
      },
      { nome: 'antes: nunca passava de 3,85 (sempre "alto risco")', ok: maiorAntes < 3.85 },
      {
        nome: 'faixas (4,88 e 3,85) não mudaram',
        ok: d.interpretROX(4.88).status === 'success' && d.interpretROX(3.84).status === 'danger',
      },
    ],
  };
}
