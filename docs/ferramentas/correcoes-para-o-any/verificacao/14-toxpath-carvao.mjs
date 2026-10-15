import { avaliar, ler, tabela } from './lib.mjs';

export const titulo = 'Tox Path: carvão ativado em criança sem o mínimo de 25 g';

const TOX = 'v2/src/pages/ToxPath.tsx';

/** A dose de carvão da própria tela (a linha `const dose = …` do CarvaoAtivadoCalc). */
function carvao(raiz, weight) {
  const codigo = ler(raiz, TOX);
  const de = codigo.indexOf('const dose = Math.min(100');
  const linha = codigo.slice(de, codigo.indexOf('\n', de));
  return avaliar(linha, { weight }, 'dose');
}

export function rodar({ antes, depois }) {
  const pesos = [5, 10, 15, 20, 25, 40, 70, 120];
  const porKg = (g, p) => (g / p).toFixed(1).replace('.', ',');
  const linhas = pesos.map((p) => [
    `${p} kg`,
    `${carvao(antes, p)} g (${porKg(carvao(antes, p), p)} g/kg)`,
    `${carvao(depois, p)} g (${porKg(carvao(depois, p), p)} g/kg)`,
  ]);
  return {
    texto: tabela(['peso', 'antes', 'depois'], linhas),
    conferencias: [
      {
        nome: '10 kg: antes 25 g (2,5 g/kg), depois 10 g (1 g/kg)',
        ok: carvao(antes, 10) === 25 && carvao(depois, 10) === 10,
      },
      {
        nome: 'a partir de 25 kg nada muda (inclusive o teto de 100 g)',
        ok: [25, 40, 70, 100, 120, 300].every((p) => carvao(antes, p) === carvao(depois, p)),
      },
      {
        nome: 'depois: nenhum peso de 1 a 300 kg passa de 1 g/kg (arredondado) nem de 100 g',
        ok: Array.from({ length: 300 }, (_, i) => i + 1).every(
          (p) => carvao(depois, p) <= Math.round(p) && carvao(depois, p) <= 100,
        ),
      },
    ],
  };
}
