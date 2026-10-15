import type { SeededRandom } from './seeded-random';

/**
 * Como cada calculadora portada é comparada com a referência do ANY
 * (differential.spec.ts). Uma entrada por calculadora do registro.
 */

/** O que o `interpret` do ANY devolve. */
export interface AnyInterpretation {
  label: string;
  color: string;
  action: string;
}

export interface Port {
  /** id no Copiloto (o do ANY sai do catálogo, `anyId`). */
  id: string;
  /** Diferença absoluta aceita no valor. 0 = mesma aritmética, resultado idêntico. */
  tolerance: number;
  /**
   * Nome da faixa a partir do resultado do ANY, quando o rótulo de lá embute
   * o valor ("IC: 1.22 — choque provável") ou não traz a faixa (o potássio
   * diz a gravidade só na ação).
   */
  anyBandName?: (
    interpretation: AnyInterpretation,
    value: number,
    values: Readonly<Record<string, number>>,
  ) => string;
  /**
   * Valor do ANY na escala do porte, quando a escala muda (a DPP do ANY é um
   * número codificado; aqui é a data). `null` = não compara o valor.
   */
  anyValue?: (
    value: number,
    values: Readonly<Record<string, number>>,
    interpretation: AnyInterpretation,
  ) => number | null;
  /**
   * Casos em que o ANY mostra "confira a entrada" como resultado e o porte
   * não calcula (DUM no futuro): o porte precisa ficar pendente com o campo
   * marcado como incoerente.
   */
  anyPending?: (
    interpretation: AnyInterpretation,
    values: Readonly<Record<string, number>>,
  ) => boolean;
  /** Gerador próprio de entradas, quando a grade min..max de cada campo não serve (datas). */
  randomInputs?: (random: SeededRandom) => Record<string, number>;
  /**
   * Fórmulas: casos fixos nas bordas das faixas. Chave = id do campo (valor
   * digitado) ou id do item (posição da opção; ausente = a primeira).
   * Campo ausente = o mínimo da faixa.
   */
  edges?: readonly Readonly<Record<string, number>>[];
}

/** "IC: 1.22 — choque provável" → "choque provável". */
export function afterDash(interpretation: AnyInterpretation): string {
  return interpretation.label.split(' — ')[1] ?? interpretation.label;
}

export const PORTS: readonly Port[] = [
  // ── Fundação (CC-303) ──────────────────────────────────────────────────
  { id: 'chadsvasc', tolerance: 0 },
  { id: 'has-bled', tolerance: 0 },
  { id: 'qsofa', tolerance: 0 },
  { id: 'curb65', tolerance: 0 },
  {
    id: 'shock-index',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { hr: 69, sbp: 100 },
      { hr: 70, sbp: 100 },
      { hr: 139, sbp: 200 }, // 0,695 arredonda para 0,7
      { hr: 89, sbp: 100 },
      { hr: 90, sbp: 100 },
      { hr: 129, sbp: 100 },
      { hr: 130, sbp: 100 },
      { hr: 30, sbp: 300 },
      { hr: 250, sbp: 40 },
    ],
  },
];
