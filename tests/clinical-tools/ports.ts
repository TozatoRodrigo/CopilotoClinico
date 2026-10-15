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

/** Rótulo do ANY que embute a contagem ("PERC positivo (2 critérios)") → só o nome. */
function labelStartingWith(prefix: string) {
  return (interpretation: AnyInterpretation): string =>
    interpretation.label.startsWith(prefix) ? prefix : interpretation.label;
}

/** Varre um campo pelos valores dados, com os demais fixos: os limites de cada faixa de pontos. */
function sweep(
  base: Readonly<Record<string, number>>,
  id: string,
  values: readonly number[],
): Record<string, number>[] {
  return values.map((value) => ({ ...base, [id]: value }));
}

const GRACE_BASE = { age: 55, hr: 80, sbp: 130, creatinine: 1 };

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

  // ── Lote A (CC-307): cardiologia, neurologia, vascular, respiratório e sepse ──
  { id: 'heart-score', tolerance: 0 },
  { id: 'timi-nstemi', tolerance: 0 },
  {
    id: 'grace-score',
    tolerance: 0,
    edges: [
      // Somas exatamente nos limites das faixas (108/109 e 140/141).
      { age: 25, hr: 60, sbp: 90, creatinine: 1.8, killip: 2 },
      { age: 25, hr: 45, sbp: 110, creatinine: 1, killip: 3 },
      { age: 25, hr: 45, sbp: 90, creatinine: 5, killip: 3 },
      { age: 25, hr: 60, sbp: 70, creatinine: 3, killip: 3 },
      // Cada limite de pontos de cada variável.
      ...sweep(
        GRACE_BASE,
        'age',
        [18, 29, 30, 39, 40, 49, 50, 59, 60, 69, 70, 79, 80, 89, 90, 120],
      ),
      ...sweep(GRACE_BASE, 'hr', [30, 49, 50, 69, 70, 89, 90, 109, 110, 149, 150, 199, 200, 250]),
      ...sweep(GRACE_BASE, 'sbp', [40, 79, 80, 99, 100, 119, 120, 139, 140, 159, 160, 199, 200]),
      ...sweep(
        GRACE_BASE,
        'creatinine',
        [0.1, 0.3, 0.4, 0.7, 0.8, 1.1, 1.2, 1.5, 1.6, 1.9, 2, 3.9, 4, 20],
      ),
      { ...GRACE_BASE, killip: 3, arrest: 1, stdev: 1, troponin: 1 },
    ],
  },
  { id: 'egsys', tolerance: 0 },
  { id: 'sf-syncope', tolerance: 0 },
  { id: 'hunt-hess', tolerance: 0 },
  { id: 'fisher-modificado', tolerance: 0 },
  { id: 'four-score', tolerance: 0 },
  { id: 'ottawa-hsa', tolerance: 0 },
  { id: 'hints-plus', tolerance: 0 },
  { id: 'cam-icu', tolerance: 0 },
  { id: 'nihss', tolerance: 0 },
  { id: 'gcs', tolerance: 0 },
  { id: 'abcd2', tolerance: 0 },
  { id: 'ich-score', tolerance: 0 },
  {
    id: 'abc2',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { a_cm: 2, b_cm: 2, c_cm: 4.9 }, // 9,8 mL
      { a_cm: 2, b_cm: 2, c_cm: 5 }, // 10 mL
      { a_cm: 3, b_cm: 4, c_cm: 4.9 }, // 29,4 mL
      { a_cm: 3, b_cm: 4, c_cm: 5 }, // 30 mL
      { a_cm: 4, b_cm: 5, c_cm: 5.9 }, // 59 mL
      { a_cm: 4, b_cm: 5, c_cm: 6 }, // 60 mL
      { a_cm: 0.1, b_cm: 0.1, c_cm: 0.1 },
      { a_cm: 15, b_cm: 15, c_cm: 15 },
    ],
  },
  { id: 'add-rs', tolerance: 0 },
  { id: 'caprini', tolerance: 0 },
  { id: 'perc-rule', tolerance: 0, anyBandName: labelStartingWith('PERC positivo') },
  { id: 'sofa', tolerance: 0 },
  {
    id: 'tempo-o2',
    tolerance: 0,
    // O rótulo do ANY só traz o tempo; a faixa está no começo da ação.
    anyBandName: ({ action }) =>
      action.startsWith('Autonomia critica')
        ? 'Autonomia crítica'
        : action.startsWith('Autonomia limitada')
          ? 'Autonomia limitada'
          : 'Autonomia de 1 h ou mais',
    edges: [
      { volume: 340, pressure: 200, flow: 5 }, // 68 min, o exemplo da pérola
      { volume: 59, pressure: 200, flow: 2 }, // 29,5 arredonda para 30
      { volume: 58, pressure: 200, flow: 2 }, // 29
      { volume: 119, pressure: 200, flow: 2 }, // 59,5 arredonda para 60
      { volume: 118, pressure: 200, flow: 2 }, // 59
      { volume: 120, pressure: 200, flow: 2 }, // 60
      { volume: 1, pressure: 1, flow: 60 },
      { volume: 10000, pressure: 300, flow: 0.5 },
    ],
  },
  { id: 'news2', tolerance: 0 },
  {
    id: 'criterios-light',
    tolerance: 0,
    anyBandName: labelStartingWith('Exsudato'),
    edges: [
      // Razões exatamente no limite (> estrito): nenhum critério.
      { prot_lp: 3, prot_serum: 6, ldh_lp: 150, ldh_serum: 250, ldh_upper: 250 },
      { prot_lp: 3.1, prot_serum: 6, ldh_lp: 150, ldh_serum: 250, ldh_upper: 250 },
      { prot_lp: 3, prot_serum: 6, ldh_lp: 151, ldh_serum: 250, ldh_upper: 250 },
      { prot_lp: 3, prot_serum: 6, ldh_lp: 166, ldh_serum: 300, ldh_upper: 250 },
      { prot_lp: 3, prot_serum: 6, ldh_lp: 167, ldh_serum: 300, ldh_upper: 250 },
      { prot_lp: 10, prot_serum: 1, ldh_lp: 10000, ldh_serum: 10, ldh_upper: 100 },
      { prot_lp: 0.1, prot_serum: 15, ldh_lp: 10, ldh_serum: 5000, ldh_upper: 500 },
    ],
  },
  { id: 'apache-ii', tolerance: 0 },
];
