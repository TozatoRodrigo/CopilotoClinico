'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowClockwise, Cards } from '@phosphor-icons/react';
import type {
  KnowledgeCardReviewItem,
  KnowledgeCardReviewQueue,
} from '@contracts/knowledge-card-review';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { cardReviewQueryKeys, useCardReviewQueue } from '@/lib/card-review-queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { ReviewSession } from './_components/review-session';

function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-7 w-4/5" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-28 w-full" />
      <span className="sr-only">Carregando o próximo cartão…</span>
    </div>
  );
}

/**
 * CC-404 — revisão de cartões no celular. O médico revisor abre a fila entre
 * um paciente e outro e vê um cartão por vez: pergunta, resposta, dose
 * estruturada e as fontes com o trecho citado marcado. Decide aprovar (com
 * validade), corrigir (versão nova, mesma checagem de citação) ou descartar
 * com motivo; o tempo de cada revisão vai junto com a decisão.
 */
export default function CardReviewPage() {
  const queryClient = useQueryClient();
  const { physician } = useAuth();
  const [skipped, setSkipped] = useState<string[]>([]);
  // Depois da primeira decisão, o próximo cartão recebe o foco (leitor de tela).
  const [advanced, setAdvanced] = useState(false);
  const queue = useCardReviewQueue(skipped);

  function advance() {
    setAdvanced(true);
    void queryClient.invalidateQueries({ queryKey: cardReviewQueryKeys.all });
  }

  function skip(cardId: string) {
    setAdvanced(true);
    setSkipped((ids) => [...ids, cardId]);
  }

  function restart() {
    setSkipped([]);
    void queryClient.invalidateQueries({ queryKey: cardReviewQueryKeys.all });
  }

  function corrected(next: KnowledgeCardReviewItem) {
    queryClient.setQueryData<KnowledgeCardReviewQueue>(cardReviewQueryKeys.next(skipped), (old) =>
      old ? { ...old, item: next } : old,
    );
  }

  const pending = queue.data?.pending;
  const item = queue.data?.item ?? null;

  return (
    <Page width="narrow">
      <PageHeader
        size="compact"
        title="Revisão de cartões"
        description="Um cartão por vez: confira a resposta e a dose no texto da fonte e decida."
        actions={
          pending !== undefined ? (
            <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {pending === 1 ? '1 cartão na fila' : `${pending} cartões na fila`}
            </span>
          ) : null
        }
      />

      {queue.isFetching ? (
        <SessionSkeleton />
      ) : queue.error ? (
        <Alert variant="destructive">
          <AlertTitle>
            {queue.error instanceof ApiError && queue.error.status === 403
              ? 'Sem acesso à fila de revisão'
              : 'Erro ao carregar a fila'}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{queue.error.message}</span>
            {queue.error instanceof ApiError && queue.error.status === 403 ? (
              physician && !physician.crmVerified ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/verificacao-crm">Verificar meu CRM</Link>
                </Button>
              ) : null
            ) : (
              <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
                <ArrowClockwise aria-hidden="true" />
                Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : item ? (
        <ReviewSession
          key={item.card.id}
          item={item}
          autoFocus={advanced}
          onSkip={() => skip(item.card.id)}
          onDecided={advance}
          onCorrected={corrected}
          onStale={advance}
        />
      ) : skipped.length > 0 && (pending ?? 0) > 0 ? (
        <div className="border-y border-border">
          <EmptyState
            icon={<Cards weight="duotone" />}
            title="Você pulou os cartões que restam"
            description={`${skipped.length} pulado${skipped.length > 1 ? 's' : ''} nesta sessão. Eles continuam na fila.`}
            actionLabel="Voltar aos pulados"
            onAction={restart}
          />
        </div>
      ) : (
        <div className="border-y border-border">
          <EmptyState
            icon={<Cards weight="duotone" />}
            title="Fila zerada"
            description="Nenhum cartão esperando revisão agora."
            actionLabel="Atualizar"
            onAction={restart}
          />
        </div>
      )}
    </Page>
  );
}
