'use client';

import type { ScoreItem } from '@clinical-tools/calculator';
import { ScoreItemList } from '@/components/domain/clinical-tools/score-item-list';

export interface ChoiceQuestionProps<T extends string> {
  /** Identificador estável do grupo (vira o `name` dos rádios). */
  id: string;
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Pergunta de escolha única dos roteiros ("Responsivo a fluidos?", modo da
 * PP): rádio nativo, setas do teclado, alvo de 44 px. Reaproveita os itens de
 * escore da fundação (sem pontos), para não criar outro componente de rádio.
 */
export function ChoiceQuestion<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  className,
}: ChoiceQuestionProps<T>) {
  const item: ScoreItem = {
    id,
    label,
    options: options.map((option) => ({ id: option.id, label: option.label, points: 0 })),
  };
  return (
    <ScoreItemList
      items={[item]}
      answers={{ [id]: value ?? undefined }}
      onAnswer={(_itemId, optionId) => {
        const option = options.find((candidate) => candidate.id === optionId);
        if (option) onChange(option.id);
      }}
      className={className}
    />
  );
}
