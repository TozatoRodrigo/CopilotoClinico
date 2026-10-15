"use client";

import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Callout } from "@/components/ui/callout";
import { useMessages } from "@/lib/messages/use-messages";
import { SHIFT_REVIEW_CONFIDENCES, type ShiftReviewView } from "@contracts/shift-review";

/**
 * CC-801 — fim da revisão: acertos × o quanto o médico sabia. "Errou
 * marcando Sei" e "acertou chutando" são o que o método do Dr. Luiz quer
 * mostrar (o mapa por tema fica para a CC-802).
 */
export function ReviewSummary({ review }: { review: ShiftReviewView }) {
  const messages = useMessages();
  const copy = messages.shiftReview.summary;
  const { summary } = review;
  const answered = review.questions.flatMap((question) =>
    question.answer ? [{ question, answer: question.answer }] : [],
  );
  const knewButMissed = answered.some(
    ({ answer }) => answer.confidence === "know" && !answer.correct,
  );
  const guessedRight = answered.some(
    ({ answer }) => answer.confidence === "guessed" && answer.correct,
  );

  return (
    <section aria-labelledby="review-summary-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="review-summary-title" className="text-lg font-semibold text-foreground">
          {copy.title}
        </h2>
        <p className="font-display text-3xl text-foreground">
          {copy.score(summary.correct, summary.answered)}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{copy.byConfidence}</h3>
        <dl className="grid grid-cols-3 gap-2">
          {SHIFT_REVIEW_CONFIDENCES.map((confidence) => {
            const tally = summary.byConfidence[confidence];
            return (
              <div
                key={confidence}
                className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2.5"
              >
                <dt className="text-[0.8125rem] text-muted-foreground">
                  {messages.shiftReview.confidence[confidence]}
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {copy.tally(tally.correct, tally.answered)}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {knewButMissed && <Callout tone="orange">{copy.knewButMissed}</Callout>}
      {guessedRight && <Callout tone="yellow">{copy.guessedRight}</Callout>}
      {!knewButMissed && !guessedRight && <Callout tone="green">{copy.calibrated}</Callout>}

      <ul className="flex flex-col gap-1.5">
        {answered.map(({ question, answer }) => (
          <li key={question.id} className="flex items-start gap-2 text-sm text-foreground">
            {answer.correct ? (
              <CheckCircle
                className="mt-0.5 size-4 shrink-0 text-tone-green"
                weight="fill"
                aria-hidden="true"
              />
            ) : (
              <XCircle
                className="mt-0.5 size-4 shrink-0 text-tone-red"
                weight="fill"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span className="sr-only">
                {answer.correct
                  ? messages.shiftReview.feedback.correct
                  : messages.shiftReview.feedback.incorrect}
                :{" "}
              </span>
              <span className="font-medium">{question.topic}</span>
              <span className="text-muted-foreground">
                {" · "}
                {messages.shiftReview.confidence[answer.confidence]}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[0.8125rem] text-muted-foreground">{copy.done}</p>
    </section>
  );
}
