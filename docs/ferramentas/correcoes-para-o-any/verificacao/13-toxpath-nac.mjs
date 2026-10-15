import { avaliar, ler, recortar, tabela } from './lib.mjs';

export const titulo = 'Tox Path: dose de NAC com peso de dose limitado a 100 kg';

const TOX = 'v2/src/pages/ToxPath.tsx';

/** O resultado da calculadora de NAC da própria tela para um peso digitado. */
function nac(raiz, peso) {
  // Recorta até o fim do corpo da função; o `)` fecha o useMemo
  const trecho = `${recortar(ler(raiz, TOX), 'const nacResult = useMemo(() =>')})`;
  return avaliar(trecho, { useMemo: (fn) => fn(), nacPeso: String(peso) }, 'nacResult');
}

export function rodar({ antes, depois }) {
  const pesos = [60, 100, 120, 150, 250];
  const linhas = pesos.map((p) => {
    const a = nac(antes, p);
    const d = nac(depois, p);
    return [`${p} kg`, `${a.etapa1} | ${a.total}`, `${d.etapa1} | ${d.total}`];
  });
  const iguaisAte100 = [20, 45, 70, 99.9, 100].every(
    (p) => JSON.stringify(nac(antes, p)) === JSON.stringify(nac(depois, p)),
  );
  return {
    texto: tabela(['peso', 'antes (1ª etapa | total)', 'depois'], linhas),
    conferencias: [
      {
        nome: '150 kg: antes 22,5 g na 1ª etapa e 45 g no total; depois 15 g e 30 g',
        ok:
          nac(antes, 150).etapa1.startsWith('22.5 g') &&
          nac(depois, 150).etapa1.startsWith('15.0 g') &&
          nac(depois, 150).total.startsWith('Dose total: 30.0 g'),
      },
      {
        nome: 'depois: acima de 100 kg a tela avisa "calculada para 100 kg"',
        ok:
          nac(depois, 120).total.includes('calculada para 100 kg') &&
          !nac(depois, 100).total.includes('100 kg'),
      },
      { nome: 'até 100 kg nada muda', ok: iguaisAte100 },
      {
        nome: 'faixa aceita (20–250 kg) não mudou',
        ok: nac(depois, 19) === null && nac(depois, 251) === null && nac(depois, 250) !== null,
      },
    ],
  };
}
