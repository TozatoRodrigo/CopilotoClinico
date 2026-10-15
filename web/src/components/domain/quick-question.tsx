'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowSquareOut,
  Calculator,
  Cards,
  Info,
  MagnifyingGlass,
  SealCheck,
} from '@phosphor-icons/react';
import type {
  QUICK_QUESTION_MAX_LENGTH,
  QUICK_QUESTION_MIN_LENGTH,
} from '@contracts/quick-question';
import { useAskQuickQuestion } from '@/lib/clinical-queries';
import { useMessages } from '@/lib/messages/use-messages';
import type { Messages } from '@/lib/messages';
import {
  formatDose,
  formatReviewDate,
  reviewedCardHref,
  reviewerCrm,
  reviewerName,
} from '@/lib/reviewed-card';
import type {
  QuickQuestionCardAnswer,
  QuickQuestionDose,
  QuickQuestionResponse,
} from '@/lib/types';
import { SectionHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SourceOriginBadge } from '@/components/domain/source-origin-badge';

// Os tetos do contrato, sem import de valor de fora de `web/` (os de
// `@contracts` são só de tipo): o tipo literal quebra o build se mudarem lá.
const MIN_LENGTH: typeof QUICK_QUESTION_MIN_LENGTH = 3;
const MAX_LENGTH: typeof QUICK_QUESTION_MAX_LENGTH = 300;

type QuickQuestionCopy = Messages['quickQuestion'];

/** Peso como no prontuário: vírgula decimal, sem milhar. */
function formatWeight(kg: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3, useGrouping: false }).format(
    kg,
  );
}

function WeightLine({ dose, copy }: { dose: QuickQuestionDose; copy: QuickQuestionCopy }) {
  const { weightBased } = dose;
  if (weightBased.status === 'not_weight_based') return null;
  if (weightBased.status === 'computed') {
    const weight = formatWeight(weightBased.weightKg);
    return (
      <div className="flex flex-col gap-0.5 rounded-md bg-tone-gray-bg px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Calculator className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {copy.weight.computed(weight, weightBased.total, weightBased.perKg)}
        </p>
        {weightBased.cappedAtMaxDose && dose.maxDose && (
          <p className="text-[0.8125rem] text-foreground">{copy.weight.capped(dose.maxDose)}</p>
        )}
        <p className="text-xs text-muted-foreground">{copy.weight.computedNote}</p>
      </div>
    );
  }
  const text =
    weightBased.status === 'needs_weight'
      ? copy.weight.needsWeight
      : copy.weight.notComputed[weightBased.reason];
  return <p className="text-[0.8125rem] text-muted-foreground">{text}</p>;
}

function CardAnswer({
  card,
  copy,
  reviewedBy,
}: {
  card: QuickQuestionCardAnswer;
  copy: QuickQuestionCopy;
  reviewedBy: Messages['reviewedCard']['reviewedBy'];
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SourceOriginBadge origin="reviewed_card" />
          <span className="text-xs text-muted-foreground">{card.topic}</span>
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">
          {copy.cardAnswers}: <span className="text-foreground">{card.question}</span>
        </p>
      </header>

      <p className="text-[0.9375rem] leading-relaxed text-foreground">{card.answer}</p>
      {card.population && (
        <p className="text-[0.8125rem] text-muted-foreground">
          {copy.population}: {card.population}
        </p>
      )}

      {card.doses.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title={copy.doses} as="h3" />
          <ul className="flex flex-col gap-3">
            {card.doses.map((dose, index) => (
              <li key={index} className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">{formatDose(dose)}</p>
                <WeightLine dose={dose} copy={copy} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.sources.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title={copy.sources} as="h3" />
          <ul className="flex flex-col gap-2.5">
            {card.sources.map((source) => (
              <li key={source.key} className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{source.title}</span>
                <span className="text-xs text-muted-foreground">
                  {[source.section, source.sourceVersion].filter(Boolean).join(' · ')}
                </span>
                {source.quotes.map((quote) => (
                  <blockquote
                    key={quote}
                    className="max-w-[70ch] border-l-[3px] border-border pl-3 text-[0.8125rem] leading-relaxed text-foreground"
                  >
                    “{quote}”
                  </blockquote>
                ))}
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit max-w-full items-center gap-1 text-xs break-all text-link underline-offset-4 hover:underline"
                  >
                    {source.url}
                    <ArrowSquareOut className="size-3.5 shrink-0" aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <SealCheck className="size-3.5 text-tone-green" weight="fill" aria-hidden="true" />
          {reviewedBy(
            reviewerName(card.reviewer.name),
            reviewerCrm(card.reviewer),
            formatReviewDate(card.reviewedAt),
          )}
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link href={reviewedCardHref(card.cardId)}>
            <Cards aria-hidden="true" />
            {copy.openCard}
          </Link>
        </Button>
      </footer>
    </article>
  );
}

function OpenCaseButton({ label }: { label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/encounters/new">
        {label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

function QuickQuestionResult({
  response,
  messages,
}: {
  response: QuickQuestionResponse;
  messages: Messages;
}) {
  const copy = messages.quickQuestion;
  switch (response.outcome) {
    case 'answered':
      return (
        <div className="flex flex-col gap-3">
          {response.cards.map((card) => (
            <CardAnswer
              key={card.cardId}
              card={card}
              copy={copy}
              reviewedBy={messages.reviewedCard.reviewedBy}
            />
          ))}
        </div>
      );
    case 'no_card':
      return (
        <Callout
          tone="gray"
          icon={<Info />}
          title={copy.noCard.title}
          action={<OpenCaseButton label={copy.openCase} />}
        >
          {response.gapRecorded
            ? `${copy.noCard.gapRecorded} ${copy.noCard.body}`
            : copy.noCard.body}
        </Callout>
      );
    case 'search_unavailable':
      return (
        <Callout
          tone="gray"
          icon={<Info />}
          title={copy.searchUnavailable.title}
          action={<OpenCaseButton label={copy.openCase} />}
        >
          {copy.searchUnavailable.body}
        </Callout>
      );
    case 'refused': {
      // CC-503 — recusa educada: o caso inteiro tem caminho (abrir um caso);
      // o resto só explica o que a pergunta rápida responde.
      const refusal = copy.refused[response.reason];
      return (
        <Callout
          tone="gray"
          icon={<Info />}
          title={refusal.title}
          action={
            response.reason === 'whole_case' ? <OpenCaseButton label={copy.openCase} /> : undefined
          }
        >
          {refusal.body}
        </Callout>
      );
    }
  }
}

/**
 * CC-501 — pergunta rápida no Plantão: uma dúvida curta, sem abrir caso,
 * respondida só por cartões revisados (texto assinado, dose estruturada,
 * fonte com o trecho e quem revisou). Sem cartão, diz que falta e oferece
 * abrir um caso; nada de texto gerado por IA.
 *
 * A pergunta fica só no estado desta tela: não vai para URL, armazenamento
 * local nem evento de uso.
 */
export function QuickQuestion() {
  const messages = useMessages();
  const copy = messages.quickQuestion;
  const inputId = useId();
  const hintId = useId();
  const [question, setQuestion] = useState('');
  const ask = useAskQuickQuestion();

  const trimmed = question.trim();
  const canSubmit = trimmed.length >= MIN_LENGTH && !ask.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    ask.mutate({ question: trimmed });
  }

  return (
    <section className="flex flex-col gap-3" aria-label={copy.title}>
      <SectionHeader title={copy.title} description={copy.description} />
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="sr-only">
          {copy.label}
        </label>
        <Input
          id={inputId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={MAX_LENGTH}
          placeholder={copy.placeholder}
          autoComplete="off"
          aria-describedby={hintId}
          className="sm:h-10"
        />
        <Button type="submit" size="lg" disabled={!canSubmit} loading={ask.isPending}>
          <MagnifyingGlass aria-hidden="true" />
          {copy.submit}
        </Button>
      </form>
      <p id={hintId} className="px-1 text-xs text-muted-foreground">
        {copy.privacyHint}
      </p>

      <div aria-live="polite" className="flex flex-col gap-3">
        {ask.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label={copy.pending}>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : ask.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{copy.error}</AlertDescription>
          </Alert>
        ) : ask.data ? (
          <QuickQuestionResult response={ask.data} messages={messages} />
        ) : null}
      </div>
    </section>
  );
}
