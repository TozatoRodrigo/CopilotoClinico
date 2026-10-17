'use client';

import { ArrowSquareOut, Cards, SealCheck, WarningCircle } from '@phosphor-icons/react';
import { useMessages } from '@/lib/messages/use-messages';
import { formatDose, formatReviewDate, reviewerCrm, reviewerName } from '@/lib/reviewed-card';
import type { PublishedKnowledgeCard } from '@/lib/types';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { SourceOriginBadge } from '@/components/domain/source-origin-badge';

/** CC-501 — a formatação da dose mora em `@/lib/reviewed-card`, compartilhada com a pergunta rápida. */
export { formatDose };

/**
 * CC-408 — o cartão revisado aberto pelo "Revisado por" da tela do plano: a
 * pergunta, a resposta, o que fazer (com a dose estruturada) e as fontes, com
 * quem assinou. Só leitura; a revisão fica no console admin.
 */
export function ReviewedCardView({ card }: { card: PublishedKnowledgeCard }) {
  const messages = useMessages();
  const copy = messages.reviewedCard;
  const { content } = card;

  return (
    <>
      <PageHeader
        icon={Cards}
        iconTone="green"
        eyebrow={`${copy.title} · ${card.topic}`}
        title={content.question}
        properties={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <SourceOriginBadge origin="reviewed_card" />
            <span className="inline-flex items-center gap-1">
              <SealCheck className="size-3.5 text-tone-green" weight="fill" aria-hidden="true" />
              {copy.reviewedBy(
                reviewerName(card.reviewer.name),
                reviewerCrm(card.reviewer),
                formatReviewDate(card.reviewedAt),
              )}
            </span>
            <span>{copy.version(card.version)}</span>
            <span>{copy.validUntil(formatReviewDate(card.validUntil))}</span>
          </div>
        }
      />

      {card.displayStatus === 'needs_review' && (
        <Callout tone="orange" icon={<WarningCircle weight="fill" />}>
          {copy.needsReview}
        </Callout>
      )}

      {content.population && (
        <section className="flex flex-col gap-1.5">
          <SectionHeader title={copy.population} as="h3" />
          <p className="text-sm text-foreground">{content.population}</p>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <SectionHeader title={copy.answer} as="h3" />
        <p className="text-[0.9375rem] leading-relaxed text-foreground">{content.answer}</p>
      </section>

      {content.claims.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title={copy.claims} as="h3" />
          <ul className="flex flex-col divide-y divide-border">
            {content.claims.map((claim, index) => (
              <li key={index} className="flex flex-col gap-1 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="gray">{copy.claimKind[claim.kind]}</Badge>
                  <span className="text-sm text-foreground">{claim.text}</span>
                </div>
                {claim.dose && (
                  <p className="text-[0.8125rem] text-foreground">
                    <span className="font-medium">{copy.dose}:</span> {formatDose(claim.dose)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title={copy.sources} count={content.sources.length} as="h3" />
        <ol className="flex flex-col gap-2">
          {content.sources.map((source) => (
            <li key={source.key} className="flex min-w-0 flex-col gap-0.5 text-sm">
              <span className="font-medium text-foreground">
                {source.key}. {source.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {[source.section, source.sourceVersion].filter(Boolean).join(' · ')}
              </span>
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
        </ol>
      </section>
    </>
  );
}
