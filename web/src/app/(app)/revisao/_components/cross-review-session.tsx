'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Handshake, Scales, SkipForward, WarningCircle } from '@phosphor-icons/react';
import type {
  KnowledgeCardContentInput,
  KnowledgeCardContentIssue,
} from '@contracts/knowledge-cards';
import type { KnowledgeCardCrossReviewItem } from '@contracts/knowledge-card-review';
import { ApiError } from '@/lib/api-client';
import { useAgreeCrossReview, useDivergeCrossReview } from '@/lib/card-review-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parseContentIssues } from '../_lib/card-editor';
import { useReviewTimer } from '../_lib/review-timer';
import { CardContentView } from './card-content-view';
import { CardEditor } from './card-editor';
import { CardSources } from './card-sources';
import { AgreeSheet } from './decision-sheets';
import {
  ElapsedClock,
  formatDate,
  reportDecisionFailure,
  useSourceNavigation,
} from './session-parts';

const MIN_REASON_CHARS = 3;
const REASON_MAX_CHARS = 2000;

/**
 * CC-411 — revisão cruzada: um segundo médico lê o cartão aprovado (10% das
 * aprovações, sorteadas) como se fosse o primeiro revisor. Concordar mantém
 * o cartão no ar; divergir é corrigir — a correção vira versão nova e o
 * cartão sai do ar e volta para a fila até outro médico decidir.
 */
export function CrossReviewSession({
  item,
  autoFocus,
  onSkip,
  onDecided,
  onStale,
}: {
  item: KnowledgeCardCrossReviewItem;
  autoFocus: boolean;
  onSkip: () => void;
  onDecided: () => void;
  onStale: () => void;
}) {
  const timer = useReviewTimer();
  const { card, crossReview } = item;
  const [mode, setMode] = useState<'view' | 'diverge'>('view');
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);
  const [issues, setIssues] = useState<KnowledgeCardContentIssue[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const sources = useSourceNavigation();

  const agree = useAgreeCrossReview(crossReview.id);
  const diverge = useDivergeCrossReview(crossReview.id);

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus]);

  const sampled = card.versions.find((version) => version.version === item.version);
  if (!sampled) return null;

  const firstReviewer = crossReview.firstReviewer.name ?? 'o primeiro revisor';

  function confirmAgree(comment?: string) {
    agree.mutate(
      { reviewDurationMs: timer.elapsedMs(), ...(comment ? { comment } : {}) },
      {
        onSuccess: () => {
          setAgreeOpen(false);
          toast.success('Concordância registrada. O cartão continua no ar.');
          onDecided();
        },
        onError: (error) => {
          if (reportDecisionFailure(error, 'Não foi possível registrar.', onStale) === 'stale') {
            setAgreeOpen(false);
          }
        },
      },
    );
  }

  function submitDivergence(content: KnowledgeCardContentInput) {
    if (reason.trim().length < MIN_REASON_CHARS) {
      setReasonMissing(true);
      reasonRef.current?.focus();
      return;
    }
    diverge.mutate(
      {
        reason: reason.trim(),
        reviewDurationMs: timer.elapsedMs(),
        basedOnVersion: item.version,
        content,
      },
      {
        onSuccess: () => {
          toast.success(
            'Divergência registrada. O cartão saiu do ar e voltou para a fila com a sua correção.',
          );
          onDecided();
        },
        onError: (error) => {
          const contentIssues =
            error instanceof ApiError && error.status === 422
              ? parseContentIssues(error.body)
              : null;
          if (contentIssues) setIssues(contentIssues);
          else reportDecisionFailure(error, 'Não foi possível registrar a divergência.', onStale);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge variant="purple">{card.topic}</Badge>
        <Badge variant="blue">
          <Scales weight="bold" aria-hidden="true" />
          Revisão cruzada
        </Badge>
        <span className="text-xs text-muted-foreground">Versão {sampled.version} publicada</span>
        <span className="flex-1" />
        <ElapsedClock timer={timer} />
        {mode === 'view' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSkip}
            disabled={agree.isPending}
          >
            <SkipForward aria-hidden="true" />
            Pular
          </Button>
        )}
      </div>

      <Callout
        tone="blue"
        icon={<Scales weight="bold" />}
        title="Segunda leitura de um cartão no ar"
      >
        Aprovado por {firstReviewer} em {formatDate(crossReview.approvedAt)}, vale até{' '}
        {formatDate(crossReview.validUntil)}. Leia como se fosse o primeiro revisor: concordar
        mantém o cartão no ar; divergir pede a correção e tira o cartão do ar até outro médico
        decidir.
      </Callout>

      {mode === 'diverge' ? (
        <CardEditor
          content={sampled.content}
          version={sampled.version}
          nextVersion={card.currentVersion + 1}
          issues={issues}
          saving={diverge.isPending}
          title={`Divergir da versão ${sampled.version}`}
          submitLabel="Divergir e tirar do ar"
          onCancel={() => {
            setIssues([]);
            setReasonMissing(false);
            setMode('view');
          }}
          onSubmit={submitDivergence}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="divergence-reason">O que está errado</Label>
            <Textarea
              ref={reasonRef}
              id="divergence-reason"
              value={reason}
              rows={3}
              maxLength={REASON_MAX_CHARS}
              aria-required="true"
              aria-invalid={
                reasonMissing && reason.trim().length < MIN_REASON_CHARS ? true : undefined
              }
              aria-describedby="divergence-reason-help"
              onChange={(event) => setReason(event.target.value)}
            />
            <p
              id="divergence-reason-help"
              className={cn(
                'text-xs',
                reasonMissing && reason.trim().length < MIN_REASON_CHARS
                  ? 'text-tone-red'
                  : 'text-muted-foreground',
              )}
            >
              {reasonMissing && reason.trim().length < MIN_REASON_CHARS
                ? 'Escreva o que está errado: a divergência é registrada com o motivo.'
                : 'Obrigatório. Corrija o cartão abaixo; se ele não deve existir, explique aqui e deixe o conteúdo como está.'}
            </p>
          </div>
        </CardEditor>
      ) : (
        <CardContentView
          content={sampled.content}
          onOpenSource={sources.openSource}
          headingRef={headingRef}
        />
      )}

      <CardSources
        sources={sampled.content.sources}
        sourceTexts={item.sourceTexts}
        openKeys={sources.openKeys}
        onOpenChange={sources.toggleSource}
      />

      {mode === 'view' && (
        <div
          role="group"
          aria-label="Decisão da revisão cruzada"
          className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-background px-4 py-3 sm:mx-0 sm:flex sm:justify-end sm:px-0 md:bottom-0"
        >
          <Button
            type="button"
            variant="destructive"
            disabled={agree.isPending}
            onClick={() => setMode('diverge')}
          >
            <WarningCircle weight="bold" aria-hidden="true" />
            Divergir
          </Button>
          <Button type="button" disabled={agree.isPending} onClick={() => setAgreeOpen(true)}>
            <Handshake weight="bold" aria-hidden="true" />
            Concordo
          </Button>
        </div>
      )}

      <AgreeSheet
        open={agreeOpen}
        onOpenChange={setAgreeOpen}
        version={sampled.version}
        firstReviewer={firstReviewer}
        pending={agree.isPending}
        onConfirm={confirmAgree}
      />
    </div>
  );
}
