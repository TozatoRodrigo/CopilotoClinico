import type { KnowledgeCardDose } from '../../shared/contracts/knowledge-cards';
import type { WeightBasedDose } from '../../shared/contracts/quick-question';

/**
 * CC-501 — dose por peso na pergunta rápida ("adrenalina IM na anafilaxia em
 * criança de 20 kg"): a quantidade por kg da dose estruturada do cartão vezes
 * o peso escrito na pergunta, limitada ao teto do próprio cartão.
 *
 * O motor das ferramentas (ADR-017, PR #180) ainda não está na base. Até lá,
 * esta conta é a mínima e recusa tudo o que não for multiplicação direta: dose
 * por tempo (mg/kg/dia, mcg/kg/min), faixa ("0,01–0,02 mg/kg"), teto em outra
 * unidade e peso ambíguo não calculam — a tela mostra a dose do cartão como
 * foi assinada e o motivo. Quando o motor entrar, a leitura de número e as
 * faixas de peso passam a ser as dele.
 */

/** Faixa de peso do motor das ferramentas (pediátrico a partir de 0,5 kg, adulto até 200 kg). */
export const MIN_WEIGHT_KG = 0.5;
export const MAX_WEIGHT_KG = 200;

export type WeightReading =
  | { status: 'none' }
  | { status: 'found'; kg: number }
  | { status: 'ambiguous' }
  | { status: 'out_of_range' };

/** "1.500": milhar ou decimal? Ponto seguido de exatamente três dígitos não é lido. */
const AMBIGUOUS_THOUSANDS = /^\d{1,3}\.\d{3}$/;

/** Número com vírgula ou ponto decimal; `null` quando ambíguo ou inválido. */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim();
  if (AMBIGUOUS_THOUSANDS.test(text)) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** "20 kg", "20kg", "3,5 quilos". Não pega "mg/kg": antes do "kg" precisa vir o número. */
const WEIGHT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b/gi;

/**
 * O peso escrito na pergunta (já mascarada). Dois pesos diferentes, ou um
 * número ambíguo, não viram conta: errar o peso é errar a dose.
 */
export function readWeightKg(question: string): WeightReading {
  const values = new Set<number>();
  for (const match of question.matchAll(WEIGHT_PATTERN)) {
    const value = parseDecimal(match[1] ?? '');
    if (value === null) return { status: 'ambiguous' };
    values.add(value);
  }
  if (values.size === 0) return { status: 'none' };
  if (values.size > 1) return { status: 'ambiguous' };
  const [kg] = [...values];
  if (kg === undefined || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
    return { status: 'out_of_range' };
  }
  return { status: 'found', kg };
}

/** "µg" e "μg" são "mcg"; o resto, sem caixa. Unidade diferente não se compara. */
function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase();
  return lower === 'µg' || lower === 'μg' || lower === 'ug' ? 'mcg' : lower;
}

const UNIT = '(mg|mcg|µg|μg|ug|g|ui|u|meq|mmol|ml|gotas?)';
/** Tem "por kg" em algum lugar: a dose depende do peso. */
const PER_KG_ANYWHERE = /(?:\/|\bpor\s+)\s*kg\b/i;
/** "0,01 mg/kg", "20 mL/kg", "0,15 mg por kg" — e o que sobrar depois. */
const PER_KG_AMOUNT = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\s*(?:\\/|por\\s+)\\s*kg\\b(.*)$`,
  'i',
);
/** "0,5 mg", "0,5 mg por dose", "0,5 mg/dose". */
const MAX_DOSE_AMOUNT = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*${UNIT}(?:\\s*(?:\\/\\s*dose|por\\s+dose))?\\.?$`,
  'i',
);

/** Número no formato do prontuário: vírgula decimal, sem milhar, até três casas. */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(value);
}

type ParsedQuantity = { value: number; unit: string };

function parseMaxDose(maxDose: string): ParsedQuantity | null {
  const match = MAX_DOSE_AMOUNT.exec(maxDose.trim());
  if (!match) return null;
  const value = parseDecimal(match[1] ?? '');
  return value === null ? null : { value, unit: match[2] ?? '' };
}

/**
 * A dose do cartão para o peso da pergunta. Só calcula com dose por kg
 * simples, peso único dentro da faixa e teto (se houver) na mesma unidade.
 */
export function computeWeightBasedDose(
  dose: Pick<KnowledgeCardDose, 'amount' | 'maxDose'>,
  weight: WeightReading,
): WeightBasedDose {
  const amount = dose.amount.trim();
  if (!PER_KG_ANYWHERE.test(amount)) return { status: 'not_weight_based' };

  const match = PER_KG_AMOUNT.exec(amount);
  const rest = match?.[3]?.trim() ?? '';
  if (match && rest.startsWith('/')) return { status: 'not_computed', reason: 'rate_or_daily' };
  const perKg = match && rest === '' ? parseDecimal(match[1] ?? '') : null;
  if (!match || perKg === null) return { status: 'not_computed', reason: 'unparsed_amount' };
  const unit = match[2] ?? '';

  if (weight.status === 'none') return { status: 'needs_weight' };
  if (weight.status === 'ambiguous') return { status: 'not_computed', reason: 'ambiguous_weight' };
  if (weight.status === 'out_of_range') {
    return { status: 'not_computed', reason: 'weight_out_of_range' };
  }

  let cap: number | null = null;
  if (dose.maxDose) {
    const max = parseMaxDose(dose.maxDose);
    if (!max || normalizeUnit(max.unit) !== normalizeUnit(unit)) {
      return { status: 'not_computed', reason: 'max_dose_not_comparable' };
    }
    cap = max.value;
  }

  const raw = perKg * weight.kg;
  const cappedAtMaxDose = cap !== null && raw > cap;
  const total = cappedAtMaxDose && cap !== null ? cap : raw;
  return {
    status: 'computed',
    weightKg: weight.kg,
    perKg: amount,
    total: `${formatQuantity(total)} ${unit}`,
    cappedAtMaxDose,
  };
}
