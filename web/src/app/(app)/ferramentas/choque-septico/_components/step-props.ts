import { formatDecimal } from '@clinical-tools/numbers';
import type {
  SepticShockAction,
  SepticShockState,
  SepticValues,
} from '@clinical-tools/shock/septic-roteiro';

/** O que cada passo recebe da tela do roteiro. */
export interface SepticStepProps {
  state: SepticShockState;
  /** Valores válidos já lidos do estado (o que está fora da faixa vem `null`). */
  values: SepticValues;
  dispatch: (action: SepticShockAction) => void;
  /** Relógio injetado: o reducer é puro e recebe o horário em cada registro. */
  now: () => number;
}

/** Valor com unidade para os selos de dados ("5,5 s"); `null` vira "--". */
export function withUnit(value: number | null, unit: string, decimals = 1): string | null {
  return value === null ? null : `${formatDecimal(value, decimals)} ${unit}`;
}
