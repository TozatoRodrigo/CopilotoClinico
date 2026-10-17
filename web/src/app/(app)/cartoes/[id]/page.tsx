'use client';

import { use } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { usePublishedKnowledgeCard } from '@/lib/clinical-queries';
import { useMessages } from '@/lib/messages/use-messages';
import { Page } from '@/components/layout/page';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewedCardView } from '../_components/reviewed-card-view';

/** CC-408 — página do cartão revisado, aberta pelo "Revisado por" da tela do plano. */
export default function ReviewedCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const messages = useMessages();
  const { data: card, isLoading, isError } = usePublishedKnowledgeCard(id);

  return (
    <Page width="narrow">
      {isLoading ? (
        <div
          className="flex flex-col gap-4"
          aria-busy="true"
          aria-label={messages.reviewedCard.loading}
        >
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError || !card ? (
        <Callout tone="gray" icon={<WarningCircle />}>
          {messages.reviewedCard.notFound}
        </Callout>
      ) : (
        <ReviewedCardView card={card} />
      )}
    </Page>
  );
}
