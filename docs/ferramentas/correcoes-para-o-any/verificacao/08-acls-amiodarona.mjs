import { avaliar, ler, recortar, tabela } from './lib.mjs';

export const titulo = 'ACLS: card "Agora" sugere amiodarona após o 3º e o 5º choque';

const ACLS = 'v2/src/pages/AclsGuide.tsx';

/** O card "Agora" da própria tela, para um estado da parada. */
function agora(raiz, state) {
  // O início inclui o tipo de retorno, para o recorte pegar o corpo da função (e não o tipo)
  const getGuide = recortar(
    ler(raiz, ACLS),
    "function getGuide(): { text: string; sub: string; type: 'action' | 'info' | 'alert' | 'success' }",
  );
  return avaliar(getGuide, { state }, 'getGuide()');
}

export function rodar({ antes, depois }) {
  const linhas = [];
  const quando = (raiz, droga, amio300Given) => {
    for (let choques = 0; choques <= 8; choques += 1) {
      const card = agora(raiz, {
        rhythm: 'shockable',
        shockCount: choques,
        amio300Given,
        amio150Given: false,
        epiInterval: 240,
      });
      if (card.text.includes(droga)) return choques;
    }
    return null;
  };
  for (let choques = 1; choques <= 6; choques += 1) {
    const amio300Given = choques >= 4;
    const estado = {
      rhythm: 'shockable',
      shockCount: choques,
      amio300Given,
      amio150Given: false,
      epiInterval: 240,
    };
    linhas.push([
      `${choques} choque(s)${amio300Given ? ', 300 mg já dada' : ''}`,
      agora(antes, estado).text,
      agora(depois, estado).text,
    ]);
  }
  return {
    texto: tabela(['choques registrados', 'card "Agora" antes', 'card "Agora" depois'], linhas),
    conferencias: [
      {
        nome: 'amiodarona 300 mg: antes a partir do 2º choque, depois a partir do 3º',
        ok: quando(antes, '300 mg', false) === 2 && quando(depois, '300 mg', false) === 3,
      },
      {
        nome: 'amiodarona 150 mg: antes a partir do 4º choque, depois a partir do 5º',
        ok: quando(antes, '150 mg', true) === 4 && quando(depois, '150 mg', true) === 5,
      },
      {
        nome: 'ritmo não chocável: card igual',
        ok:
          agora(antes, { rhythm: 'nonshockable', shockCount: 3, epiInterval: 240 }).text ===
          agora(depois, { rhythm: 'nonshockable', shockCount: 3, epiInterval: 240 }).text,
      },
    ],
  };
}
