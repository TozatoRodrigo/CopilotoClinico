import type { ScoreItem } from '../calculator';
import { formatCompact } from '../numbers';

/** Item "Não / Sim" — a forma da maioria dos critérios de escore do ANY. */
export function yesNoItem(id: string, label: string, points = 1): ScoreItem {
  return binaryItem(id, label, ['Não', 'Sim'], points);
}

/**
 * Item de duas opções com rótulos próprios ("Ausente / Presente", "Nenhuma /
 * Pelo menos 1 presente"). A primeira vale 0; a segunda, `points`.
 */
export function binaryItem(
  id: string,
  label: string,
  [absent, present]: readonly [string, string],
  points = 1,
): ScoreItem {
  return {
    id,
    label,
    options: [
      { id: 'nao', label: absent, points: 0 },
      { id: 'sim', label: present, points },
    ],
  };
}

/** Opção em tupla: [id, rótulo, pontos]. */
export type OptionTuple = readonly [id: string, label: string, points: number];

/** Item de escolha com as opções na ordem do ANY (o teste diferencial compara por posição). */
export function choiceItem(
  id: string,
  label: string,
  options: readonly OptionTuple[],
  role?: ScoreItem['role'],
): ScoreItem {
  return {
    id,
    label,
    ...(role ? { role } : {}),
    options: options.map(([optionId, optionLabel, points]) => ({
      id: optionId,
      label: optionLabel,
      points,
    })),
  };
}

/** A faixa é o resultado: a tela mostra o nome dela no lugar do número (CAM-ICU, Forrest). */
export const bandIsResult = (): null => null;

/** "0 critérios", "1 critério", "3 critérios" — regras de contagem (PERC, Ottawa). */
export function criteriaCount(value: number): string {
  return `${formatCompact(value)} ${value === 1 ? 'critério' : 'critérios'}`;
}
