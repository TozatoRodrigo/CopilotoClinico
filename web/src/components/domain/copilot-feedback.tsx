'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, Flag, MagnifyingGlass, ThumbsUp } from '@phosphor-icons/react';
import type { KNOWLEDGE_GAP_NOTE_MAX_CHARS as ContractGapNoteMax } from '@contracts/clinical';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCopilotFeedback, useReportKnowledgeGap } from '@/lib/clinical-queries';
import { trackEvent } from '@/lib/analytics';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { CopilotFeedbackKind } from '@/lib/types';

/** Ver `KNOWLEDGE_GAP_NOTE_MAX_CHARS` no contrato (o web não empacota ../src). */
const GAP_NOTE_MAX_CHARS: typeof ContractGapNoteMax = 280;

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
 *
 * CC-703 — "Não encontrei o que precisava" é outro sinal: não diz que a
 * análise errou, diz o que faltou (uma dose, um cartão, uma ferramenta). Vai
 * para o registro de lacunas, que decide o que escrever primeiro, e não para
 * a fila de triagem; por isso tem estado próprio e continua disponível
 * depois de um reporte.
 */
export function CopilotFeedback({ encounterId, interactionId, className }: CopilotFeedbackProps) {
  const [selected, setSelected] = useState<CopilotFeedbackKind | null>(null);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [gapOpen, setGapOpen] = useState(false);
  const [gapNote, setGapNote] = useState('');
  const [gapSent, setGapSent] = useState(false);
  const feedback = useCopilotFeedback(encounterId);
  const knowledgeGap = useReportKnowledgeGap(encounterId);

  const active = PROBLEM_OPTIONS.find((option) => option.kind === selected);

  async function send(kind: CopilotFeedbackKind, text?: string) {
    try {
      await feedback.mutateAsync({ interactionId, kind, comment: text?.trim() || undefined });
      trackEvent('feedback_enviado', { tipo: kind });
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

  async function sendGap() {
    const note = gapNote.trim() || undefined;
    try {
      await knowledgeGap.mutateAsync({ interactionId, note });
      // Só se houve nota, nunca o texto dela.
      trackEvent('nao_encontrei', { com_nota: note !== undefined });
      setGapSent(true);
      setGapOpen(false);
      setGapNote('');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível registrar. Tente novamente.',
      );
    }
  }

  // Um painel aberto por vez: o reporte e o "não encontrei" não disputam a tela.
  function toggleProblem(kind: CopilotFeedbackKind) {
    setSelected(selected === kind ? null : kind);
    setGapOpen(false);
  }

  function toggleGap() {
    setGapOpen(!gapOpen);
    setSelected(null);
  }

  // Discreto de propósito (como o 👍/👎 sob uma resposta da IA no Notion):
  // botões fantasma em cinza, sem competir com o plano nem com os documentos.
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-1">
        {sent ? (
          <p className="mr-1 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
            Reporte registrado. Ele entra na trilha de auditoria deste atendimento.
          </p>
        ) : (
          <>
            <span className="mr-1 text-[0.8125rem] text-muted-foreground">
              Esta análise ajudou?
            </span>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground max-sm:h-10"
              disabled={feedback.isPending}
              onClick={() => void send('helpful')}
            >
              <ThumbsUp />
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
                  'text-muted-foreground max-sm:h-10',
                  selected === option.kind && 'bg-active text-foreground',
                )}
                disabled={feedback.isPending}
                onClick={() => toggleProblem(option.kind)}
              >
                <Flag />
                {option.label}
              </Button>
            ))}
          </>
        )}

        {!gapSent && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={gapOpen}
            className={cn(
              'text-muted-foreground max-sm:h-10',
              gapOpen && 'bg-active text-foreground',
            )}
            disabled={knowledgeGap.isPending}
            onClick={toggleGap}
          >
            <MagnifyingGlass />
            Não encontrei o que precisava
          </Button>
        )}
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

      {gapOpen && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendGap();
          }}
        >
          <Input
            value={gapNote}
            onChange={(e) => setGapNote(e.target.value)}
            maxLength={GAP_NOTE_MAX_CHARS}
            placeholder="O que você procurava? Ex.: dose de ceftriaxona na meningite (opcional)"
            aria-label="O que faltou (opcional)"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setGapOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={knowledgeGap.isPending}>
              {knowledgeGap.isPending ? 'Registrando…' : 'Registrar'}
            </Button>
          </div>
        </form>
      )}

      {gapSent && (
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
          Registrado. O que faltou entra na lista do que escrever primeiro.
        </p>
      )}
    </div>
  );
}
