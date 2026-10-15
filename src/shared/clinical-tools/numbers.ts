/**
 * Números digitados e exibidos nas Ferramentas (ADR-017): vírgula decimal na
 * tela, vírgula ou ponto na entrada, unidade sempre ao lado do valor.
 *
 * Este módulo é TypeScript puro: roda no navegador, no service worker e na
 * API. Não importe nada de Node nem do DOM aqui.
 */

export type ParseDecimalResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'not-a-number' | 'ambiguous-separator' };

const DECIMAL_PATTERN = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * "1.500" é mil e quinhentos para quem digita em português e 1,5 para o
 * `parseFloat`. Na beira do leito esse engano multiplica a dose por mil, então
 * ponto seguido de exatamente três dígitos (sem zero à esquerda) é recusado e
 * a tela pede para reescrever.
 */
const THOUSANDS_LOOKALIKE = /^-?[1-9]\d{0,2}\.\d{3}$/;

/** Lê um número digitado com vírgula ou ponto decimal ("72,5", "72.5", " 72 "). */
export function parseDecimal(raw: string): ParseDecimalResult {
  const text = raw.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (!DECIMAL_PATTERN.test(text)) return { ok: false, reason: 'not-a-number' };
  if (THOUSANDS_LOOKALIKE.test(text)) return { ok: false, reason: 'ambiguous-separator' };
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: 'not-a-number' };
}

/**
 * Formata com vírgula decimal e casas fixas. Mesmo algoritmo do `fmt` do ANY
 * (`toFixed` + troca do separador), para a tela mostrar o mesmo número que o
 * médico via lá — o teste diferencial confere.
 */
export function formatDecimal(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return value.toFixed(decimals).replace('.', ',');
}

/** Valor com a unidade ao lado ("6,6 mL/h"). Equivale ao `fmtDose`/`fmtMlh` do ANY. */
export function formatQuantity(value: number, unit: string, decimals = 1): string {
  return `${formatDecimal(value, decimals)} ${unit}`;
}

/** Peso com unidade; sem peso (nulo ou zero) mostra "-- kg", como o `fmtWeight` do ANY. */
export function formatWeight(kg: number | null): string {
  if (!kg) return '-- kg';
  return `${formatDecimal(kg, 1)} kg`;
}

/**
 * Número sem zeros finais inúteis ("0,5", "40", "1,25"): para limites de faixa
 * e valores de escore, onde casas fixas confundem ("40,0 a 200,0 kg").
 */
export function formatCompact(value: number, maxDecimals = 2): string {
  const fixed = value.toFixed(maxDecimals);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return trimmed.replace('.', ',');
}
