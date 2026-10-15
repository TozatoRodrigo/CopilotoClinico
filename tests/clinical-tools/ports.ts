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

/** Data fixa para as contas que dependem do dia (idade gestacional, DPP): 14/10/2026, 10h30. */
export const FIXED_NOW = new Date(2026, 9, 14, 10, 30);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * DUM aleatória entre 40 dias no futuro e ~6,5 anos atrás (sem passar de
 * 2020, o mínimo do campo), sempre uma data que existe.
 */
function randomDum(random: SeededRandom): Record<string, number> {
  const offset = random.integer(-40, 2400);
  const date = new Date(
    FIXED_NOW.getFullYear(),
    FIXED_NOW.getMonth(),
    FIXED_NOW.getDate() - offset,
  );
  if (date.getFullYear() < 2020) {
    return { dum_day: random.integer(1, 28), dum_month: 1, dum_year: 2020 };
  }
  return { dum_day: date.getDate(), dum_month: date.getMonth() + 1, dum_year: date.getFullYear() };
}

const DUM_EDGES = [
  { dum_day: 14, dum_month: 10, dum_year: 2026 }, // hoje: 0 dias
  { dum_day: 13, dum_month: 10, dum_year: 2026 },
  { dum_day: 15, dum_month: 10, dum_year: 2026 }, // amanhã: DUM no futuro
  { dum_day: 7, dum_month: 1, dum_year: 2026 }, // 40 semanas
  { dum_day: 29, dum_month: 2, dum_year: 2024 }, // ano bissexto
  { dum_day: 31, dum_month: 12, dum_year: 2025 },
  { dum_day: 1, dum_month: 1, dum_year: 2020 },
];

/** "DUM no futuro" do ANY: aqui o campo fica marcado e nada é calculado. */
function futureDum({ label }: AnyInterpretation): boolean {
  return label === 'DUM no futuro';
}

/** "IG: 12s3d | DPP: 01/02/2027" → a DPP em dias desde 01/01/1970, a escala do porte. */
function dueDateFromLabel(
  _value: number,
  _values: Readonly<Record<string, number>>,
  { label }: AnyInterpretation,
): number | null {
  const match = label.match(/DPP: (\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return Math.round(Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS);
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

const CVC_SITES: Readonly<Record<string, string>> = {
  JID: 'Jugular interna direita: 12–15 cm',
  JIE: 'Jugular interna esquerda: 15–18 cm',
  SCD: 'Subclávia direita: 13–15 cm',
  SCE: 'Subclávia esquerda: 15–18 cm',
  Femoral: 'Femoral: 20–25 cm',
};

const GRACE_BASE = { age: 55, hr: 80, sbp: 130, creatinine: 1 };

/** Resultado de uma faixa só, com o valor no rótulo do ANY ("Volume total 24h: 5600 mL"). */
function singleBand(name: string) {
  return (): string => name;
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

  // ── Lote B (CC-308): gastro, trauma, hemodinâmica, toxicologia, renal e metabólico ──
  { id: 'rockall', tolerance: 0 },
  { id: 'glasgow-blatchford', tolerance: 0 },
  { id: 'forrest', tolerance: 0 },
  { id: 'child-pugh', tolerance: 0 },
  {
    id: 'meld-na',
    tolerance: 0,
    edges: [
      { bilirubin: 0.5, inr: 0.8, creatinine: 0.5, sodium: 140 }, // piso de 6
      { bilirubin: 50, inr: 10, creatinine: 15, sodium: 100 }, // teto de 40
      { bilirubin: 1, inr: 1, creatinine: 1, sodium: 137 },
      { bilirubin: 2, inr: 1.5, creatinine: 1.5, sodium: 130 },
      { bilirubin: 4, inr: 2, creatinine: 4, sodium: 125 },
      { bilirubin: 4, inr: 2, creatinine: 4.1, sodium: 124 },
    ],
  },
  { id: 'bonacini', tolerance: 0 },
  { id: 'alvarado', tolerance: 0 },
  { id: 'tash', tolerance: 0 },
  { id: 'pecarn', tolerance: 0 },
  { id: 'mbig', tolerance: 0 },
  { id: 'canadian-cspine', tolerance: 0 },
  {
    id: 'parkland',
    tolerance: 0,
    anyBandName: singleBand('Volume total em 24 h'),
    edges: [
      { weight: 70, scq: 40 },
      { weight: 70, scq: 50 },
      { weight: 70, scq: 80 }, // SCQ limitada a 50%
      { weight: 70.5, scq: 33 },
      { weight: 1, scq: 1 },
      { weight: 200, scq: 100 },
    ],
  },
  {
    id: 'dc-vti',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { lvot: 0.6, vti: 35.3, hr: 250 }, // 2,495 arredonda para 2,50
      { lvot: 0.7, vti: 41.7, hr: 249 }, // 3,996 arredonda para 4,00
      { lvot: 1, vti: 41.6, hr: 245 }, // 8,005 arredonda para 8,00
      { lvot: 2, vti: 20, hr: 80 },
      { lvot: 0.5, vti: 1, hr: 20 },
      { lvot: 4, vti: 50, hr: 250 },
    ],
  },
  {
    id: 'gradiente-aa',
    tolerance: 0,
    // O rótulo do ANY embute o valor; a faixa está entre parênteses.
    anyBandName: ({ label }) =>
      label.includes('(normal para idade)') ? 'Normal para a idade' : 'Elevado',
    edges: [
      { fio2: 21, paco2: 40, pao2: 85.7, age: 40 }, // 14,0 = esperado (14)
      { fio2: 21, paco2: 40, pao2: 85.6, age: 40 }, // 14,1
      { fio2: 21, paco2: 40, pao2: 600, age: 18 }, // gradiente negativo
      { fio2: 100, paco2: 120, pao2: 20, age: 120 },
      { fio2: 50, paco2: 35, pao2: 100, age: 65 },
    ],
  },
  {
    id: 'delta-gap',
    tolerance: 0,
    anyBandName: afterDash,
    anyPending: ({ label }) => label === 'HCO3 normal',
    edges: [
      { ag: 20, hco3: 24 }, // HCO3 normal: o ANY devolve 999
      { ag: 12, hco3: 14 }, // razão 0
      { ag: 22, hco3: 14 }, // razão 1
      { ag: 32, hco3: 14 }, // razão 2
      { ag: 32.1, hco3: 14 }, // razão 2,01
      { ag: 20, hco3: 30 }, // HCO3 alto: razão negativa
      { ag: 0, hco3: 1 },
      { ag: 50, hco3: 50 },
    ],
  },
  {
    id: 'pam',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { sbp: 90, dbp: 45 }, // 60
      { sbp: 88, dbp: 45 }, // 59,3
      { sbp: 92, dbp: 50 }, // 64
      { sbp: 95, dbp: 50 }, // 65
      { sbp: 140, dbp: 80 }, // 100
      { sbp: 143, dbp: 80 }, // 101
      { sbp: 40, dbp: 200 }, // PAD maior que PAS: o ANY calcula mesmo assim
    ],
  },
  {
    id: 'formula-winters',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { hco3: 10, pco2: 21 }, // esperada 23: limite inferior exato
      { hco3: 10, pco2: 20.9 },
      { hco3: 10, pco2: 25 }, // limite superior exato
      { hco3: 10, pco2: 25.1 },
      { hco3: 12.3, pco2: 24.5 }, // 26,45 arredonda para 26,5
      { hco3: 1, pco2: 5 },
      { hco3: 50, pco2: 120 },
    ],
  },
  { id: 'ciwa-ar', tolerance: 0 },
  { id: 'pss', tolerance: 0 },
  {
    id: 'nomograma-rumack',
    tolerance: 0,
    anyBandName: ({ label }) =>
      label.includes('ACIMA') ? 'Acima da linha de tratamento' : 'Abaixo da linha de tratamento',
    edges: [
      { hours: 4, level: 150 }, // no limite conta como acima
      { hours: 4, level: 149 },
      { hours: 8, level: 75 },
      { hours: 6.5, level: 97 },
      { hours: 24, level: 5 },
      { hours: 24, level: 4 },
      { hours: 12, level: 0 },
    ],
  },
  {
    id: 'qtc-corrigido',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { qt: 439, hr: 60 },
      { qt: 440, hr: 60 },
      { qt: 499, hr: 60 },
      { qt: 500, hr: 60 },
      { qt: 200, hr: 30 },
      { qt: 800, hr: 250 },
    ],
  },
  {
    id: 'intervalo-osmolar',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { osm_measured: 299, na: 140, glucose: 90, urea: 30 }, // 9
      { osm_measured: 300, na: 140, glucose: 90, urea: 30 }, // 10
      { osm_measured: 309, na: 140, glucose: 90, urea: 30 }, // 19
      { osm_measured: 310, na: 140, glucose: 90, urea: 30 }, // 20
      { osm_measured: 200, na: 180, glucose: 1000, urea: 300 },
    ],
  },
  { id: 'akin-kdigo', tolerance: 0 },
  {
    id: 'correcao-na',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { na_measured: 130, glucose: 400, factor: 1.6 }, // 134,8
      { na_measured: 130, glucose: 413, factor: 1.6 }, // 135,0
      { na_measured: 140, glucose: 413, factor: 1.6 }, // 145,0
      { na_measured: 140, glucose: 420, factor: 1.6 }, // 145,1
      { na_measured: 125, glucose: 600, factor: 2.4 },
      { na_measured: 160, glucose: 1500, factor: 2.4 },
    ],
  },
  {
    id: 'deficit-agua',
    tolerance: 0,
    anyBandName: singleBand('Déficit de água livre'),
    edges: [
      { na: 140, weight: 70, act_factor: 0.6 }, // zero
      { na: 130, weight: 70, act_factor: 0.6 }, // negativo
      { na: 160, weight: 70, act_factor: 0.5 },
      { na: 200, weight: 200, act_factor: 0.6 },
    ],
  },
  {
    id: 'osmolaridade',
    tolerance: 0,
    anyBandName: (interpretation) =>
      afterDash(interpretation).replace('hipoosmolar', 'hipo-osmolar'),
    edges: [
      { na: 135, glucose: 54, urea: 12 }, // 275
      { na: 134, glucose: 54, urea: 12 }, // 273
      { na: 145, glucose: 54, urea: 12 }, // 295
      { na: 145, glucose: 54, urea: 18 }, // 296
      { na: 100, glucose: 20, urea: 1 },
      { na: 180, glucose: 1000, urea: 300 },
    ],
  },
  {
    id: 'correcao-na-adrogue',
    tolerance: 0,
    anyBandName: singleBand('Variação estimada por litro de infusato'),
    edges: [
      { na_patient: 120, na_infusate: 513, weight: 70, sex_age: 0 },
      { na_patient: 120, na_infusate: 154, weight: 50, sex_age: 2 },
      { na_patient: 160, na_infusate: 0, weight: 80, sex_age: 1 }, // água livre: negativo
      { na_patient: 100, na_infusate: 855, weight: 20, sex_age: 2 },
    ],
  },
  {
    id: 'cockcroft-gault',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { age: 50, weight: 72, creatinine: 1 }, // 90
      { age: 51, weight: 72, creatinine: 1 }, // 89
      { age: 80, weight: 72, creatinine: 1 }, // 60
      { age: 110, weight: 72, creatinine: 1 }, // 30
      { age: 80, weight: 36, creatinine: 2 }, // 15
      { age: 80, weight: 36, creatinine: 2, sex: 1 }, // 12,75 feminino
      { age: 120, weight: 30, creatinine: 20 },
      { age: 18, weight: 250, creatinine: 0.1 },
    ],
  },
  {
    id: 'ckd-epi',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { age: 40, creatinine: 0.9 },
      { age: 40, creatinine: 0.7, sex: 1 },
      { age: 18, creatinine: 0.1 },
      { age: 120, creatinine: 20, sex: 1 },
      { age: 60, creatinine: 1.5 },
    ],
  },
  {
    id: 'correcao-calcio',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { calcium: 8.4, albumin: 4 },
      { calcium: 8.5, albumin: 4 },
      { calcium: 10.5, albumin: 4 },
      { calcium: 10.6, albumin: 4 },
      { calcium: 7.5, albumin: 2.8 },
      { calcium: 2, albumin: 6 },
    ],
  },
  {
    id: 'correcao-potassio',
    tolerance: 0,
    // O ANY põe a gravidade só no texto da ação ("Hipocalemia leve").
    anyBandName: ({ label, action }) =>
      label === 'Potássio normal' ? label : (action.match(/Hipocalemia [^.]+/)?.[0] ?? label),
    edges: [6.5, 4, 3.9, 3.5, 3.4, 3, 2.9, 2.5, 2.4, 1].map((k) => ({ k })),
  },
  {
    id: 'anion-gap',
    tolerance: 0,
    anyBandName: afterDash,
    edges: [
      { na: 140, cl: 104, hco3: 22, albumin: 4 }, // 14
      { na: 140, cl: 103, hco3: 22, albumin: 4 }, // 15
      { na: 140, cl: 98, hco3: 22, albumin: 4 }, // 20
      { na: 140, cl: 97, hco3: 22, albumin: 4 }, // 21
      { na: 140, cl: 104, hco3: 22, albumin: 2 }, // corrigido 19
      { na: 100, cl: 140, hco3: 50, albumin: 0.5 },
    ],
  },

  // ── Lote C (CC-309): obstetrícia, via aérea, sedação e dor, infecção, farmacologia,
  // procedimentos e POCUS ──
  {
    id: 'dpp-dum',
    tolerance: 0,
    anyBandName: singleBand('Data provável do parto (Naegele)'),
    anyValue: dueDateFromLabel,
    anyPending: futureDum,
    randomInputs: randomDum,
    edges: DUM_EDGES,
  },
  { id: 'bishop', tolerance: 0 },
  {
    id: 'idade-gestacional',
    tolerance: 0,
    anyBandName: singleBand('Idade gestacional'),
    anyPending: futureDum,
    randomInputs: randomDum,
    edges: DUM_EDGES,
  },
  { id: 'hellp', tolerance: 0 },
  { id: 'mgso4-dose', tolerance: 0 },
  { id: 'cormack-lehane', tolerance: 0 },
  { id: 'mallampati', tolerance: 0 },
  { id: 'rass', tolerance: 0, anyBandName: afterDash },
  { id: 'bps', tolerance: 0, anyBandName: afterDash },
  { id: 'eva-nrs', tolerance: 0 },
  { id: 'centor-mcisaac', tolerance: 0 },
  {
    id: 'corticoide-equiv',
    tolerance: 0,
    anyBandName: singleBand('Equivalência em prednisona'),
    edges: [
      { dose: 20, from: 0 }, // hidrocortisona 20 = prednisona 5
      { dose: 25, from: 1 },
      { dose: 5, from: 2 },
      { dose: 4, from: 4 },
      { dose: 0.75, from: 6 },
      { dose: 0.1, from: 6 },
      { dose: 2000, from: 1 },
    ],
  },
  {
    id: 'posicao-cvc',
    tolerance: 0,
    // O ANY usa o mesmo rótulo para todos os sítios; o sítio está no começo da ação.
    anyBandName: ({ action }) => CVC_SITES[action.split(':')[0] ?? ''] ?? action,
  },
  { id: 'vti-classificacao', tolerance: 0 },
];
