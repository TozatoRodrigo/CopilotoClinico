import { formatCompact, parseDecimal } from '../numbers';
import { formatConcentration } from './dose';
import type { InfusionDrug } from './drugs';

/**
 * "Minha diluição" (CC-311): o preparo do serviço do médico, em ampolas e
 * volume final, guardado no aparelho por droga. Porte da trava do
 * `DoseCalculator.tsx` do ANY, com as mesmas mensagens.
 *
 * A faixa é assimétrica de propósito (comentário original do ANY): diluir mais
 * baixa a concentração e AUMENTA o mL/h, e o erro aparece na tela; concentrar
 * mais derruba o mL/h e um zero a mais entrega muito mais droga com um número
 * que continua plausível. O piso de 0,05× ainda pega o zero a mais no volume,
 * e a trava de volume mínimo cobre o caso inverso.
 */
export const CUSTOM_DILUTION_LIMITS = { minRatio: 0.05, maxRatio: 4 } as const;

export interface CustomDilution {
  ampoules: number;
  /** Volume final da bolsa, em mL. */
  volume: number;
  /** Concentração resultante, na unidade da droga. */
  concentration: number;
}

export type CustomDilutionCheck =
  /** Falta ou não dá para ler um dos dois campos: sem prévia. */
  | { status: 'incompleta'; message: string }
  /** Os dois campos lidos, mas o preparo foi barrado: prévia com o motivo. */
  | { status: 'barrada'; message: string; ampoules: number; volume: number; concentration: number }
  | { status: 'valida'; dilution: CustomDilution };

function readPositive(raw: string): number | null {
  const parsed = parseDecimal(raw);
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

/**
 * Confere o preparo digitado. Ordem e textos do ANY: ampolas, volume, volume
 * mínimo (o das próprias ampolas) e a razão contra a concentração padrão.
 */
export function checkCustomDilution(
  drug: InfusionDrug,
  ampoulesRaw: string,
  volumeRaw: string,
): CustomDilutionCheck {
  return checkCustomDilutionValues(drug, readPositive(ampoulesRaw), readPositive(volumeRaw));
}

/** O mesmo, com os números já lidos (`null` = vazio, ilegível ou ≤ 0). */
export function checkCustomDilutionValues(
  drug: InfusionDrug,
  ampoules: number | null,
  volume: number | null,
): CustomDilutionCheck {
  const ampoule = drug.ampoule;
  if (!ampoule) return { status: 'incompleta', message: 'Esta droga não aceita diluição própria.' };
  if (ampoules === null || !(ampoules > 0)) {
    return { status: 'incompleta', message: 'Informe quantas ampolas.' };
  }
  if (volume === null || !(volume > 0)) {
    return { status: 'incompleta', message: 'Informe o volume final em mL.' };
  }

  // Ampolas × massa da ampola ÷ volume final.
  const concentration = (ampoules * ampoule.mass) / volume;
  const barred = (message: string): CustomDilutionCheck => ({
    status: 'barrada',
    message,
    ampoules,
    volume,
    concentration,
  });

  if (ampoule.volume !== undefined && volume < ampoules * ampoule.volume) {
    return barred(
      `O volume final não pode ser menor que o volume das ampolas (${formatCompact(ampoules * ampoule.volume)} mL).`,
    );
  }
  const unit = drug.concentrationUnit;
  const standard = `${formatConcentration(drug.concentration)} ${unit}`;
  if (concentration > drug.concentration * CUSTOM_DILUTION_LIMITS.maxRatio) {
    return barred(
      `Resultado de ${formatConcentration(concentration)} ${unit} — mais de ${CUSTOM_DILUTION_LIMITS.maxRatio} vezes o padrão de ${standard}. Confira as ampolas e o volume.`,
    );
  }
  if (concentration < drug.concentration * CUSTOM_DILUTION_LIMITS.minRatio) {
    return barred(
      `Resultado de ${formatConcentration(concentration)} ${unit} — muito abaixo do padrão de ${standard}. Confira o volume final.`,
    );
  }
  return { status: 'valida', dilution: { ampoules, volume, concentration } };
}

/**
 * Preparo por extenso, para conferir contra a bolsa pendurada ("5 ampolas de
 * 50 mg / 10 mL em 250 mL"). O ANY arredondava para inteiro e 2,5 ampolas
 * aparecia como "3 ampolas"; aqui o número sai como foi digitado.
 */
export function describePreparation(drug: InfusionDrug, ampoules: number, volume: number): string {
  const noun = ampoules === 1 ? 'ampola' : 'ampolas';
  return `${formatCompact(ampoules)} ${noun} de ${drug.ampoule?.label ?? ''} em ${formatCompact(volume)} mL`;
}

/**
 * Lê a diluição guardada sem confiar no que está lá: valor estranho, de outra
 * versão ou fora da trava volta a ser "sem diluição própria", e a droga usa o
 * padrão em vez de calcular com lixo. A concentração é recalculada da ampola.
 */
export function parseStoredCustomDilution(
  drug: InfusionDrug,
  raw: string | null,
): CustomDilution | null {
  if (!raw || !drug.ampoule) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { ampoules, volume } = parsed as Record<string, unknown>;
  if (typeof ampoules !== 'number' || typeof volume !== 'number') return null;
  if (!Number.isFinite(ampoules) || !Number.isFinite(volume)) return null;
  const check = checkCustomDilutionValues(drug, ampoules, volume);
  return check.status === 'valida' ? check.dilution : null;
}
