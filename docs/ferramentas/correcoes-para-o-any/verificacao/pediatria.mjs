// Carrega as drogas em bolus do PedGuide (any.app.br) e do HETRIN Ped
// (hetrinped.netlify.app) a partir da cópia temporária, recortando só o dado e
// as contas (o resto é tela). Usado pelas verificações 01, 05 e 19.

import { avaliar, ler, recortar } from './lib.mjs';

export const PEDGUIDE = 'v2/src/pages/PedGuide.tsx';
export const HETRIN = 'v2/public/hetrinped/index.html';

const ARRAYS = [
  'PCR_DRUGS',
  'IOT_DRUGS',
  'EMERGENCY_DRUGS',
  'CONVULSION_DRUGS',
  'NEURO_DRUGS',
  'PAIN_DRUGS',
  'RESP_DRUGS',
  'AGE_DRUGS',
  'TOX_DRUGS',
];

/** Drogas por id. `fonte` é PEDGUIDE ou HETRIN. */
export function drogas(raiz, fonte) {
  const codigo = ler(raiz, fonte);
  const ts = fonte === PEDGUIDE;
  // Helpers de formatação declarados antes das drogas (fN e, depois do patch 05, fV)
  const helpers = ['const fN', 'const fV']
    .filter((h) => codigo.includes(`${h} =`))
    .map((h) => {
      const de = codigo.indexOf(`${h} =`);
      return codigo.slice(de, codigo.indexOf('\n', de));
    });
  const blocos = ARRAYS.filter((nome) =>
    codigo.includes(`const ${nome}${ts ? ': BolusDrug[]' : ''} =`),
  ).map((nome) => recortar(codigo, `const ${nome}${ts ? ': BolusDrug[]' : ''} =`));
  const nomes = ARRAYS.filter((nome) =>
    codigo.includes(`const ${nome}${ts ? ': BolusDrug[]' : ''} =`),
  );
  const lista = avaliar([...helpers, ...blocos].join('\n'), {}, `[${nomes.join(', ')}].flat()`);
  return Object.fromEntries(lista.map((d) => [d.id, d]));
}

/** "0,63" → 0.63; "--" ou faixa → NaN. */
export function numero(texto) {
  return Number(String(texto).replace(',', '.'));
}
