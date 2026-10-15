"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowSquareOut, Check, CheckCircle, XCircle } from "@phosphor-icons/react";
import { SourceOriginBadge } from "@/components/domain/source-origin-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/messages/use-messages";
import { cn } from "@/lib/utils";
import { SHIFT_REVIEW_CONFIDENCES } from "@/lib/shift-review-contract";
import type { ShiftReviewConfidence, ShiftReviewQuestionView } from "@contracts/shift-review";

interface ReviewQuestionCardProps {
  question: ShiftReviewQuestionView;
  onAnswer: (answer: { chosenOption: number; confidence: ShiftReviewConfidence }) => void;
  /** Resposta a caminho do servidor: trava as opções. */
  pending?: boolean;
  /** Botão depois do feedback: próxima pergunta ou resumo. */
  next?: ReactNode;
}

/**
 * CC-801 — uma pergunta por vez. Dois toques: a alternativa e o quanto o
 * médico sabia ("Sei", "Tenho dúvida", "Chutei"), que já envia. Respondida,
 * mostra o acerto, a explicação e a fonte que a análise citou.
 */
export function ReviewQuestionCard({ question, onAnswer, pending, next }: ReviewQuestionCardProps) {
  const messages = useMessages();
  const copy = messages.shiftReview;
  const [selected, setSelected] = useState<number | null>(null);
  const answer = question.answer;
  const locked = pending || answer !== null;
  const chosen = answer?.chosenOption ?? selected;

  return (
    <article
      aria-labelledby={`review-question-${question.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="gray">
          {question.format === "true_false"
            ? copy.question.trueFalse
            : copy.question.multipleChoice}
        </Badge>
        <Badge variant="purple">{question.topic}</Badge>
      </div>

      <h2
        id={`review-question-${question.id}`}
        className="text-pretty text-lg font-semibold text-foreground"
      >
        {question.stem}
      </h2>

      <div role="group" aria-label={copy.question.optionsLabel} className="flex flex-col gap-2">
        {question.options.map((option, index) => (
          <OptionButton
            key={option}
            label={option}
            selected={chosen === index}
            outcome={
              answer === null
                ? null
                : index === answer.correctOption
                  ? "correct"
                  : index === answer.chosenOption
                    ? "incorrect"
                    : null
            }
            disabled={locked}
            onClick={() => setSelected(index)}
          />
        ))}
      </div>

      {answer === null ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{copy.question.confidenceHeading}</p>
          <div className="grid grid-cols-3 gap-2">
            {SHIFT_REVIEW_CONFIDENCES.map((confidence) => (
              <Button
                key={confidence}
                type="button"
                variant="outline"
                className="h-11 whitespace-normal px-2 leading-tight"
                disabled={pending || selected === null}
                onClick={() => {
                  if (selected === null) return;
                  onAnswer({ chosenOption: selected, confidence });
                }}
              >
                {copy.confidence[confidence]}
              </Button>
            ))}
          </div>
          <p className="text-[0.8125rem] text-muted-foreground" aria-live="polite">
            {pending ? copy.question.sending : copy.question.confidenceHint}
          </p>
        </div>
      ) : (
        <AnswerFeedback question={question} next={next} />
      )}
    </article>
  );
}

function AnswerFeedback({
  question,
  next,
}: {
  question: ShiftReviewQuestionView;
  next?: ReactNode;
}) {
  const messages = useMessages();
  const copy = messages.shiftReview.feedback;
  const answer = question.answer;
  if (answer === null) return null;
  const correctOption = question.options[answer.correctOption] ?? "";

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md px-3.5 py-3",
          answer.correct
            ? "bg-tone-green-bg text-tone-green-ink"
            : "bg-tone-red-bg text-tone-red-ink",
        )}
      >
        {answer.correct ? (
          <CheckCircle
            className="mt-0.5 size-5 shrink-0 text-tone-green"
            weight="fill"
            aria-hidden="true"
          />
        ) : (
          <XCircle
            className="mt-0.5 size-5 shrink-0 text-tone-red"
            weight="fill"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 space-y-0.5 text-sm">
          <p className="font-semibold">{answer.correct ? copy.correct : copy.incorrect}</p>
          {!answer.correct && <p>{copy.correctAnswer(correctOption)}</p>}
          <p className="opacity-90">
            {copy.yourConfidence(messages.shiftReview.confidence[answer.confidence])}
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{copy.explanation}</h3>
        <p className="text-pretty text-sm text-foreground">{answer.explanation}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-md bg-tone-gray-bg px-3.5 py-3">
        <h3 className="text-[0.8125rem] font-semibold text-muted-foreground">{copy.source}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {answer.source.title}
            {answer.source.version ? ` · ${answer.source.version}` : ""}
          </p>
          <SourceOriginBadge origin={answer.source.origin ?? undefined} />
        </div>
        {answer.source.excerpt && (
          <blockquote className="border-l-2 border-border pl-3 text-[0.8125rem] text-muted-foreground">
            {answer.source.excerpt}
          </blockquote>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
          {answer.source.url && (
            <a
              href={answer.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
            >
              {copy.openSource}
              <ArrowSquareOut className="size-3.5" aria-hidden="true" />
            </a>
          )}
          <Link
            href={`/encounters/${answer.encounterId}`}
            className="text-link underline-offset-4 hover:underline"
          >
            {answer.caseTitle ? `${copy.openCase}: ${answer.caseTitle}` : copy.openCase}
          </Link>
        </div>
      </section>

      {next}
    </div>
  );
}

function OptionButton({
  label,
  selected,
  outcome,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  outcome: "correct" | "incorrect" | null;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-default",
        outcome === "correct" && "border-tone-green bg-tone-green-bg text-tone-green-ink",
        outcome === "incorrect" && "border-tone-red bg-tone-red-bg text-tone-red-ink",
        outcome === null &&
          (selected
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-foreground hover:bg-hover"),
      )}
    >
      {selected && outcome === null && (
        <Check className="size-4 shrink-0" weight="bold" aria-hidden="true" />
      )}
      {outcome === "correct" && (
        <CheckCircle className="size-4 shrink-0 text-tone-green" weight="fill" aria-hidden="true" />
      )}
      {outcome === "incorrect" && (
        <XCircle className="size-4 shrink-0 text-tone-red" weight="fill" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}
