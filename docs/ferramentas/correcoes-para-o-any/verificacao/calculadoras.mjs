// Carrega uma calculadora do calculatorData.ts do ANY (cópia temporária) e
// pontua como a tela do ANY pontua (Calculators.tsx): soma o `value` da opção
// escolhida em cada item e chama `interpret(score, seleções)`.

import { carregarModulo, ler, opcaoPara } from './lib.mjs';

const DADOS = 'v2/src/data/calculatorData.ts';

export function calculadora(raiz, id) {
  const { ALL_CALCULATORS } = carregarModulo(ler(raiz, DADOS), 'calculatorData.ts');
  const calc = ALL_CALCULATORS.find((c) => c.id === id);
  if (!calc) throw new Error(`calculadora ${id} não encontrada`);
  return calc;
}

/** Pontua um escore a partir de valores clínicos: escolhe, em cada item, a opção cujo rótulo cobre o valor. */
export function pontuarPorValor(calc, valores) {
  const selecoes = {};
  for (const item of calc.items) selecoes[item.id] = opcaoPara(item, valores[item.id]).value;
  return resultado(calc, selecoes);
}

/** Pontua a partir das seleções já feitas (id do item → value da opção). */
export function resultado(calc, selecoes) {
  const score = calc.items.reduce((s, item) => s + (selecoes[item.id] || 0), 0);
  return { score, ...calc.interpret(score, selecoes) };
}
