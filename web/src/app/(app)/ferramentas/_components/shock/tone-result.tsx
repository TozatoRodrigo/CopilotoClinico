'use client';

import type { ReactNode } from 'react';
import { Info, Warning, WarningOctagon } from '@phosphor-icons/react';
import type { ResultTone } from '@clinical-tools/tone';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Callout } from '@/components/ui/callout';
import { toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';

const TONE_ICON: Record<ResultTone, ReactNode> = {
  neutral: <Info />,
  attention: <Warning />,
  critical: <WarningOctagon />,
};

/** Rótulo do tom ao lado da cor: estado nunca só por cor (ADR-017). */
export const TONE_LABEL: Record<ResultTone, string> = {
  neutral: 'Sem alerta',
  attention: 'Atenção',
  critical: 'Crítico',
};

export interface ToneResultProps {
  tone: ResultTone;
  title: ReactNode;
  children?: ReactNode;
  /** Ação ao lado do texto (ex.: "Iniciar Tier 1"). */
  action?: ReactNode;
  /**
   * Resultado que muda enquanto o médico digita é anunciado pelo leitor de
   * tela (`status`). Texto fixo de orientação não precisa.
   */
  live?: boolean;
  className?: string;
}

/**
 * Resultado de um passo do roteiro no tom do design system (cinza, laranja,
 * vermelho), com ícone e título: o tom vem do motor, o texto também.
 */
export function ToneResult({
  tone,
  title,
  children,
  action,
  live = true,
  className,
}: ToneResultProps) {
  return (
    <div
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      data-tone={tone}
      className={className}
    >
      <Callout tone={RESULT_TONE[tone]} icon={TONE_ICON[tone]} title={title} action={action}>
        {children}
      </Callout>
    </div>
  );
}

/** Pílula com o rótulo de uma faixa no tom dela ("Hiporresponsividade grave"). */
export function ToneTag({
  tone,
  children,
  className,
}: {
  tone: ResultTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-[3px] px-1.5 py-0.5 text-sm font-medium',
        toneTag[RESULT_TONE[tone]],
        className,
      )}
    >
      {children}
    </span>
  );
}
