/**
 * Nomograma de Rumack-Matthew (paracetamol): uma implementação só, usada pela
 * calculadora (`nomograma-rumack`) e, no CC-323/CC-324, pelo roteiro de
 * Toxicologia. No ANY havia duas cópias da conta (calculatorData e ToxPath)
 * que diferiam no arredondamento; vale a da calculadora, que é a que tem
 * teste diferencial (achado para a revisão clínica, CC-310).
 *
 * Linha de tratamento com meia-vida de 4 h: 150 mcg/mL às 4 h caindo até
 * ~4,7 mcg/mL às 24 h, `150 × e^(-0,173 × (h - 4))`, com 0,173 ≈ ln(2)/4.
 */

/** Janela em que o nomograma vale: de 4 a 24 h após a ingestão aguda única. */
export const RUMACK_MATTHEW_HOURS = { min: 4, max: 24 } as const;

/** Linha de tratamento (mcg/mL) na hora dada, arredondada a 0,1 como no ANY. */
export function rumackMatthewLine(hours: number): number {
  const line = 150 * Math.exp(-0.173 * (hours - 4));
  return Math.round(line * 10) / 10;
}

export interface RumackMatthewAssessment {
  /** Linha de tratamento na hora da coleta (mcg/mL). */
  line: number;
  /** Nível no limite da linha ou acima: indica N-acetilcisteína pelo nomograma. */
  aboveLine: boolean;
}

/** Compara o nível sérico com a linha (no limite conta como acima, como no ANY). */
export function assessRumackMatthew(hours: number, level: number): RumackMatthewAssessment {
  const line = rumackMatthewLine(hours);
  return { line, aboveLine: level >= line };
}
