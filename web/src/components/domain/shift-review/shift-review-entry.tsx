"use client";

import Link from "next/link";
import { GraduationCap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  reviewOf,
  shouldShowShiftReviewEntry,
  useShiftReviewState,
} from "@/hooks/use-shift-review";
import { useMessages } from "@/lib/messages/use-messages";

export const SHIFT_REVIEW_HREF = "/revise-seu-plantao";

/**
 * CC-801 — entrada "Revise seu plantão" no Plantão. Só aparece com a flag
 * ligada e algo para revisar: sem revisão, com a da semana concluída ou com
 * erro na consulta, não ocupa espaço.
 */
export function ShiftReviewEntry() {
  const messages = useMessages();
  const copy = messages.shiftReview.entry;
  const { data: state } = useShiftReviewState();
  if (!shouldShowShiftReviewEntry(state)) return null;

  const review = reviewOf(state);
  const remaining = review?.questions.filter((question) => question.answer === null).length ?? 0;
  const started = review !== null && remaining < review.questions.length;
  const detail =
    state?.status === "generating"
      ? copy.preparing
      : started
        ? copy.remaining(remaining)
        : copy.description;

  return (
    <Callout
      tone="blue"
      icon={<GraduationCap weight="duotone" />}
      title={copy.title}
      action={
        <Button asChild size="sm" className="max-sm:w-full">
          <Link href={SHIFT_REVIEW_HREF}>{started ? copy.resume : copy.action}</Link>
        </Button>
      }
    >
      {detail}
    </Callout>
  );
}
