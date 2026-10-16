'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GraduationCap } from '@phosphor-icons/react';
import { EmptyState } from '@/components/domain/empty-state';
import { ReviewQuestionCard } from '@/components/domain/shift-review/review-question-card';
import { ReviewSummary } from '@/components/domain/shift-review/review-summary';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  nextUnanswered,
  reviewOf,
  useAnswerShiftReviewQuestion,
  useShiftReviewState,
  useStartShiftReview,
} from '@/hooks/use-shift-review';
import { useMessages } from '@/lib/messages/use-messages';
import type { ShiftReviewView } from '@contracts/shift-review';

/**
 * CC-801 — "Revise seu plantão". Abrir a tela gera as perguntas da semana
 * quando ainda não existem; depois, uma pergunta por vez, o feedback com a
 * fonte e, no fim, o resumo acertos × o quanto o médico sabia.
 */
export default function ShiftReviewPage() {
  const messages = useMessages();
  const copy = messages.shiftReview;
  const stateQuery = useShiftReviewState();
  const { mutate: startReview, isPending: starting, error: startError } = useStartShiftReview();
  const state = stateQuery.data;
  const opened = useRef(false);

  // Abrir a revisão é o pedido de geração (uma vez por visita à tela).
  useEffect(() => {
    if (state?.status !== 'available' || opened.current) return;
    opened.current = true;
    startReview();
  }, [state?.status, startReview]);

  const review = reviewOf(state);

  return (
    <Page width="narrow">
      <PageHeader
        size="compact"
        icon={GraduationCap}
        iconTone="blue"
        title={copy.title}
        description={copy.page.description}
      />

      {stateQuery.isPending ? (
        <ReviewSkeleton />
      ) : stateQuery.isError || startError ? (
        <Alert variant="destructive">
          <AlertTitle>{copy.page.errorTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{(stateQuery.error ?? startError)?.message}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (startError ? startReview() : void stateQuery.refetch())}
            >
              {messages.common.actions.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      ) : review ? (
        <ReviewFlow review={review} />
      ) : state?.status === 'generating' || state?.status === 'available' || starting ? (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <p className="text-sm font-medium text-foreground">{copy.page.preparingTitle}</p>
          <p className="text-sm text-muted-foreground">{copy.page.preparingDescription}</p>
          <ReviewSkeleton />
        </div>
      ) : (
        <EmptyState
          icon={<GraduationCap weight="duotone" />}
          title={copy.page.unavailableTitle}
          description={copy.page.unavailableDescription}
          actionLabel={copy.page.backToShift}
          actionHref="/dashboard"
        />
      )}
    </Page>
  );
}

function ReviewFlow({ review }: { review: ShiftReviewView }) {
  const messages = useMessages();
  const copy = messages.shiftReview;
  const answer = useAnswerShiftReviewQuestion();
  // A pergunta recém-respondida fica na tela com o feedback até o médico seguir.
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  // No celular o feedback empurra a tela para baixo: seguir volta ao topo da pergunta.
  const top = useRef<HTMLDivElement>(null);

  const pending = nextUnanswered(review);
  const current = review.questions.find((question) => question.id === feedbackId) ?? pending;
  if (!current) return <ReviewSummary review={review} />;

  const total = review.questions.length;
  const remainingAfterCurrent = review.questions.filter(
    (question) => question.answer === null && question.id !== current.id,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div ref={top} className="flex scroll-mt-20 flex-col gap-1.5">
        <p className="text-[0.8125rem] text-muted-foreground">
          {copy.page.progress(current.position + 1, total)}
        </p>
        <Progress
          value={(review.summary.answered / total) * 100}
          aria-label={copy.page.progress(current.position + 1, total)}
        />
      </div>
      <ReviewQuestionCard
        key={current.id}
        question={current}
        pending={answer.isPending}
        onAnswer={(choice) =>
          answer.mutate(
            { questionId: current.id, ...choice },
            {
              onSuccess: () => setFeedbackId(current.id),
              onError: () => toast.error(copy.feedback.answerError),
            },
          )
        }
        next={
          <Button
            className="self-start max-sm:w-full"
            onClick={() => {
              top.current?.scrollIntoView?.({ block: 'start' });
              setFeedbackId(null);
            }}
          >
            {remainingAfterCurrent > 0 ? copy.feedback.next : copy.feedback.seeSummary}
          </Button>
        }
      />
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-full" />
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}
