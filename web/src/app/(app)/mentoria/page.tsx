'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowClockwise, ChatsCircle, Clock, Stethoscope, UserCircle } from '@phosphor-icons/react';
import {
  asEnabledConfig,
  MENTORING_STATUS_LABEL,
  useMentorQueue,
  useMentoringConfig,
} from '@/lib/mentoring-queries';
import type { MentorQueueItem, MentorQueueScope, MentoringRequestStatus } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

const SCOPE_TABS: { value: MentorQueueScope; label: string }[] = [
  { value: 'open', label: 'Em aberto' },
  { value: 'mine', label: 'Comigo' },
];

const STATUS_VARIANT: Record<MentoringRequestStatus, 'warning' | 'blue' | 'success' | 'secondary'> =
  {
    pending: 'warning',
    claimed: 'blue',
    answered: 'success',
    cancelled: 'secondary',
  };

const VERTICAL_LABELS: Record<string, string> = {
  trauma: 'Trauma',
  cardiac: 'Cardíaco',
  pediatric: 'Pediátrico',
  neuro: 'Neuro',
  general: 'Geral',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function QueueRow({ item }: { item: MentorQueueItem }) {
  return (
    <li>
      <Link
        href={`/mentoria/${item.id}`}
        className="flex flex-col gap-1.5 rounded-sm px-2 py-3 transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[item.status]}>
            {item.assignedToMe && item.status === 'claimed'
              ? 'Com você'
              : MENTORING_STATUS_LABEL[item.status]}
          </Badge>
          <Badge variant="purple">{VERTICAL_LABELS[item.vertical] ?? item.vertical}</Badge>
          {item.mentorName && !item.assignedToMe && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserCircle aria-hidden="true" />
              {item.mentorName}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {formatDateTime(item.createdAt)}
          </span>
        </span>
        <span className="text-sm font-medium text-foreground">
          {item.mainHypothesis ?? 'Sem hipótese principal'}
        </span>
        {item.question && (
          <span className="line-clamp-2 text-[0.8125rem] text-muted-foreground">
            {item.question}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * CC-707 — fila dos médicos da equipe (`is_mentor`). Em aberto, o pedido mais
 * antigo primeiro; "Comigo", o que o mentor assumiu ou respondeu.
 */
export default function MentorQueuePage() {
  const config = useMentoringConfig();
  const isMentor = asEnabledConfig(config.data)?.isMentor === true;
  const [scope, setScope] = useState<MentorQueueScope>('open');
  const queue = useMentorQueue(scope, isMentor);

  if (config.isPending) {
    return (
      <Page width="default">
        <Skeleton className="h-24" />
      </Page>
    );
  }

  if (!isMentor) {
    return (
      <Page width="narrow">
        <EmptyState
          icon={<Stethoscope weight="duotone" />}
          title="Área dos médicos da equipe"
          description="A fila de mentoria é restrita aos médicos da equipe que respondem os pedidos."
          actionLabel="Voltar ao Plantão"
          actionHref="/dashboard"
        />
      </Page>
    );
  }

  const items = queue.data?.items ?? [];

  return (
    <Page width="default">
      <PageHeader
        icon={Stethoscope}
        title="Mentoria"
        description="Casos que médicos pediram para discutir com a equipe. Assíncrono: não é urgência. O caso chega mascarado, com o plano da IA."
      />

      <Tabs
        value={scope}
        onValueChange={(value) => setScope(value === 'mine' ? 'mine' : 'open')}
        className="gap-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border">
          <TabsList aria-label="Filtrar pedidos" className="border-b-0">
            {SCOPE_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.value === 'open' ? (
                  <Clock aria-hidden="true" />
                ) : (
                  <ChatsCircle aria-hidden="true" />
                )}
                {tab.label}
                {tab.value === 'open' && (queue.data?.pendingCount ?? 0) > 0 && (
                  <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] bg-tone-orange-tag px-1 text-xs font-normal text-tone-orange-ink tabular-nums">
                    {queue.data?.pendingCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-sm:size-10"
            aria-label="Atualizar fila"
            onClick={() => void queue.refetch()}
            disabled={queue.isFetching}
          >
            <ArrowClockwise className={cn(queue.isFetching && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>
      </Tabs>

      {queue.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : queue.error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar a fila</AlertTitle>
          <AlertDescription>{queue.error.message}</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState
            icon={<ChatsCircle weight="duotone" />}
            title={scope === 'open' ? 'Nenhum pedido em aberto' : 'Nenhum pedido com você'}
            description={
              scope === 'open'
                ? 'Quando um médico pedir para discutir um caso, ele aparece aqui.'
                : 'Os pedidos que você assumir ou responder aparecem aqui.'
            }
          />
        </div>
      ) : (
        <ul
          aria-label="Pedidos de mentoria"
          className="divide-y divide-border border-y border-border"
        >
          {items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Page>
  );
}
