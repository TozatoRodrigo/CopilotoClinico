import type { ResultTone } from '../tone';
import { VENTILATION_REFERENCES } from './content';

/** Critérios de SDRA pela definição Global 2024, como no VM Guide do ANY (`SDRA_TABLE`). */

export interface SdraSeverityRow {
  id: string;
  severity: string;
  /** Faixa de P/F (PEEP ≥ 5), como texto do ANY. */
  pf: string;
  /** Faixa de S/F (SpO₂ ≤ 97%), como texto do ANY. */
  sf: string;
  /** Verde, amarelo e vermelho do ANY, pela regra de cores do ADR-017. */
  tone: ResultTone;
}

export const SDRA_DESCRIPTION =
  'A definição Global 2024 expandiu os critérios de Berlim, incluindo S/F para locais sem gasometria, CNAF como suporte válido, e ultrassonografia para imagem.';

export const SDRA_COLUMNS = { pf: 'P/F (PEEP ≥ 5)', sf: 'S/F (SpO₂ ≤ 97%)' } as const;

export const SDRA_SEVERITY: readonly SdraSeverityRow[] = [
  { id: 'leve', severity: 'Leve', pf: '200-300', sf: '235-315', tone: 'neutral' },
  { id: 'moderada', severity: 'Moderada', pf: '100-199', sf: '148-234', tone: 'attention' },
  { id: 'grave', severity: 'Grave', pf: '<100', sf: '<148', tone: 'critical' },
];

export const SDRA_GLOBAL_2024_CHANGES: readonly string[] = [
  'Suporte: VM invasiva, VNI ou CNAF ≥ 30 L/min',
  'Imagem: Rx, TC ou ultrassonografia',
  'S/F validado como alternativa a P/F',
  'Opacidades bilaterais não explicadas por outras causas',
];

export const SDRA_CITATION = VENTILATION_REFERENCES.sdra;
