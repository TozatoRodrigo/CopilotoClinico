'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ThumbsUp, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCopilotFeedback } from '@/lib/clinical-queries';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { CopilotFeedbackKind } from '@/lib/types';

const PROBLEM_OPTIONS: Array<{ kind: CopilotFeedbackKind; label: string; placeholder: string }> = [
  {
    kind: 'wrong_scenario',
    label: 'Cenário errado',
    placeholder: 'Qual era o quadro? Ex.: era dengue e a análise foi para sepse.',
  },
  {
    kind: 'missing_coverage',
    label: 'Faltou diretriz',
    placeholder: 'Qual diretriz deveria ter sido usada aqui?',
  },
  {
    kind: 'wrong_recommendation',
    label: 'Conduta incorreta',
    placeholder: 'O que estava errado na conduta sugerida?',
  },
];

interface CopilotFeedbackProps {
  encounterId: string;
  interactionId: string;
  className?: string;
}

/**
 * F7 — Fecha o ciclo de feedback.
 *
 * Os dois erros clínicos que motivaram os pacotes KB-005/KB-006 chegaram por
 * mensagem, dias depois, sem `interactionId` e sem os chunks recuperados —
 * reproduzir dependia de alguém lembrar o que tinha sido digitado. Aqui o
 * reporte já nasce com o rastro técnico anexado pelo backend (chunks
 * recuperados, cobertura do retrieval, chunks citados).
 *
 * "Foi útil" não é enfeite: sem exemplos positivos não há como calibrar o
 * piso de relevância — é preciso comparar a distribuição de similaridade dos
 * casos bons contra a dos casos reportados como errados.
 */
export function CopilotFeedback({ encounterId, interactionId, className }: CopilotFeedbackProps) {
  const [selected, setSelected] = useState<CopilotFeedbackKind | null>(null);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const feedback = useCopilotFeedback(encounterId);

  const active = PROBLEM_OPTIONS.find((option) => option.kind === selected);

  async function send(kind: CopilotFeedbackKind, text?: string) {
    try {
      await feedback.mutateAsync({ interactionId, kind, comment: text?.trim() || undefined });
      setSent(true);
      setSelected(null);
      setComment('');
      toast.success('Obrigado — o reporte foi registrado com o rastro técnico da análise.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível registrar. Tente novamente.',
      );
    }
  }

  if (sent) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        Reporte registrado. Ele entra na trilha de auditoria deste atendimento.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2.5 border-t border-clinical-line pt-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
          Esta análise ajudou?
        </span>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={feedback.isPending}
          onClick={() => void send('helpful')}
        >
          <ThumbsUp className="size-3.5" />
          Foi útil
        </Button>

        {PROBLEM_OPTIONS.map((option) => (
          <Button
            key={option.kind}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={selected === option.kind}
            className={cn(
              'h-7 gap-1.5 px-2 text-xs',
              selected === option.kind && 'bg-clinical-amber-bg text-clinical-amber-foreground',
            )}
            disabled={feedback.isPending}
            onClick={() => setSelected(selected === option.kind ? null : option.kind)}
          >
            <Warning className="size-3.5" />
            {option.label}
          </Button>
        ))}
      </div>

      {active && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={active.placeholder}
            aria-label={active.placeholder}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={feedback.isPending}
              onClick={() => void send(active.kind, comment)}
            >
              {feedback.isPending ? 'Enviando…' : 'Enviar reporte'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
