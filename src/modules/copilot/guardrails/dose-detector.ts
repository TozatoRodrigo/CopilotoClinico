/**
 * F1 — detector de dose no texto de uma recomendação (ADR-013): conduta com
 * `basis: 'model_knowledge'` não pode trazer dose, taxa nem concentração — a
 * dose vem de fonte citada ou do protocolo local.
 *
 * Mira só "número + unidade de dose". Número sem unidade ("NIHSS 14", "PA <
 * 185/110", "glicemia < 70") é critério ou meta, não dose. Duas famílias de
 * falso positivo ficam de fora de propósito:
 * - concentração SÉRICA (`mg/dL`, `mEq/L`, `mmol/L`, `g/dL`): é limiar de
 *   exame ("Hb < 7 g/dL"), não o que se administra;
 * - fluxo de oxigênio em `L/min`: ajuste de dispositivo, não dose de droga.
 *
 * Percentual é o caso delicado: "glicose 50%" é dose (a concentração decide a
 * conduta), "SpO2 ≥ 94%" e "reduzir a PAM em 25%" são metas. Por isso `%` só
 * conta colado ao nome de uma solução ou droga. O "0,9%" do soro fisiológico
 * fica de fora: é o nome do produto, não uma escolha de concentração.
 */

const NUMBER = String.raw`\d+(?:[.,]\d+)*`;

// Alternativas mais longas antes das que são prefixo delas ("ui" antes de "u",
// "gotas" antes de "g").
const DOSE_UNIT = String.raw`(?:mcg|µg|μg|mg|meq|mmol|unidades?|ui|u|ml|l|gotas|gts|g|ampolas?|comprimidos?|cp|puffs?|jatos)`;
const RATE_SUFFIX = String.raw`(?:\s*\/\s*(?:kg|h|hora|min|dia|m2|m²))*`;
const NOT_A_LETTER = String.raw`(?![a-zµμ])`;

const NUMBER_WITH_DOSE_UNIT = new RegExp(
  String.raw`(?<![a-z0-9.,])${NUMBER}\s*(${DOSE_UNIT})${NOT_A_LETTER}(${RATE_SUFFIX})`,
  'g',
);

/** Depois de "70 mg", "/dL" ou "/L" faz dele concentração sérica. */
const SERUM_CONCENTRATION_TAIL = /^\s*\/\s*d?l(?![a-z])/;
const OXYGEN_FLOW = /^\s*\/\s*min$/;

const SOLUTION = String.raw`(?:glicose|dextrose|soro glicosado|glicosado|sgh|sg|bicarbonato(?: de sodio)?|nahco3|gluconato de calcio|cloreto de (?:calcio|potassio|sodio)|kcl|nacl|salina|sulfato de magnesio|mgso4|manitol|lidocaina|bupivacaina|albumina|solucao|g)`;
const SOLUTION_QUALIFIERS = String.raw`(?:\s+(?:hipertonic[ao]|isotonic[ao]|a|de|em))*`;
const SOLUTION_CONCENTRATION = new RegExp(
  String.raw`(?<![a-z])${SOLUTION}${SOLUTION_QUALIFIERS}\s*(${NUMBER})\s*%`,
  'g',
);
const ISOTONIC_SALINE = /^0[.,]9$/;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function doseUnitMentions(text: string): string[] {
  const mentions: string[] = [];
  for (const match of text.matchAll(NUMBER_WITH_DOSE_UNIT)) {
    const [mention, unit = '', rateSuffix = ''] = match;
    const tail = text.slice(match.index + mention.length);
    if (SERUM_CONCENTRATION_TAIL.test(tail)) continue;
    if (unit === 'l' && OXYGEN_FLOW.test(rateSuffix)) continue;
    mentions.push(mention.trim());
  }
  return mentions;
}

function concentrationMentions(text: string): string[] {
  const mentions: string[] = [];
  for (const match of text.matchAll(SOLUTION_CONCENTRATION)) {
    const [mention, concentration = ''] = match;
    if (ISOTONIC_SALINE.test(concentration)) continue;
    mentions.push(mention.trim());
  }
  return mentions;
}

/** Trechos com dose, taxa ou concentração de droga; vazio quando não há. */
export function findDoseMentions(text: string): string[] {
  const normalized = normalize(text);
  return [...doseUnitMentions(normalized), ...concentrationMentions(normalized)];
}
