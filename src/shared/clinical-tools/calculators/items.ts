import type { ScoreItem } from '../calculator';

/** Item "Não / Sim" — a forma da maioria dos critérios de escore do ANY. */
export function yesNoItem(id: string, label: string, points = 1): ScoreItem {
  return {
    id,
    label,
    options: [
      { id: 'nao', label: 'Não', points: 0 },
      { id: 'sim', label: 'Sim', points },
    ],
  };
}
