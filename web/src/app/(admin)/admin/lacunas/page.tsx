'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Circle,
  Clock,
  FileDashed,
  ListBullets,
  SealCheck,
  SealQuestion,
  Siren,
  Sparkle,
  Warning,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import {
  useDismissKnowledgeGap,
  useDraftFromKnowledgeGap,
  useKnowledgeGapQueue,
  useKnowledgeGapWeeklyReport,
  useReopenKnowledgeGap,
} from '@/lib/clinical-queries';
import { ApiError } from '@/lib/api-client';
import { messages } from '@/lib/messages';
import type {
  KnowledgeGapQueueItem,
  KnowledgeGapSeverity,
  KnowledgeGapSource,
  KnowledgeGapStatus,
  KnowledgeGapWeeklyReport,
  PsSyndrome,
} from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

/**
 * CC-409 — fila de criação de cartões.
 *
 * Cada item é um grupo de lacunas parecidas: vezes em que o médico procurou e
 * não havia cartão revisado ("não encontrei", análise sem cartão aplicável,
 * pergunta rápida). Ordem: ocorrências × gravidade da síndrome. O curador
 * pede o rascunho por IA (CC-403) com o tema do grupo, descarta com motivo
 * ou reabre; publicar o cartão fecha o grupo sozinho. O topo é o relatório
 * da semana, para o ritual de sexta.
 *
 * Só consultas e notas mascaradas — nunca o texto do caso nem o médico.
 */

const PAGE_SIZE = 20;
const ALL = 'all';
const DISMISS_REASON_MAX_CHARS = 500;

type StatusTab = KnowledgeGapStatus | typeof ALL;

interface TagDef {
  label: string;
  variant: 'warning' | 'blue' | 'success' | 'secondary' | 'destructive' | 'yellow' | 'gray';
  icon: Icon;
}

const STATUS_TABS: { value: StatusTab; label: string; icon: Icon }[] = [
  { value: 'open', label: 'Abertas', icon: Clock },
  { value: 'drafting', label: 'Em rascunho', icon: FileDashed },
  { value: 'covered', label: 'Cobertas', icon: SealCheck },
  { value: 'dismissed', label: 'Descartadas', icon: XCircle },
  { value: ALL, label: 'Todas', icon: ListBullets },
];

/** Laranja pede ação (aberta); azul = IA em andamento; verde = cartão publicado. */
const STATUS_TAG: Record<KnowledgeGapStatus, TagDef> = {
  open: { label: 'Aberta', variant: 'warning', icon: Clock },
  drafting: { label: 'Em rascunho', variant: 'blue', icon: FileDashed },
  covered: { label: 'Coberta por cartão', variant: 'success', icon: SealCheck },
  dismissed: { label: 'Descartada', variant: 'secondary', icon: XCircle },
};

/** Vermelho = gravidade crítica (semântica clínica fixa); sempre ícone + texto. */
const SEVERITY_TAG: Record<KnowledgeGapSeverity, TagDef> = {
  time_critical: { label: 'Tempo-crítica', variant: 'destructive', icon: Siren },
  urgent: { label: 'Urgente', variant: 'yellow', icon: Warning },
  common: { label: 'Comum', variant: 'gray', icon: Circle },
};

const SOURCE_LABEL: Record<KnowledgeGapSource, string> = {
  physician_not_found: 'Não encontrei',
  decision_no_card: 'Análise sem cartão',
  quick_question: 'Pergunta rápida',
};

const SOURCE_ORDER: KnowledgeGapSource[] = [
  'physician_not_found',
  'decision_no_card',
  'quick_question',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function syndromeLabel(syndrome: PsSyndrome | null): string {
  return syndrome ? messages.understanding.syndromes[syndrome] : 'Sem síndrome';
}

function topicLabel(topic: string): string {
  return topic || 'Sem consulta registrada';
}

function sourcesLabel(sources: Partial<Record<KnowledgeGapSource, number>>): string {
  return SOURCE_ORDER.flatMap((source) => {
    const count = sources[source];
    return count ? [`${SOURCE_LABEL[source]} ${count}`] : [];
  }).join(' · ');
}

/** "1 tema novo", "2 temas novos". */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function Tag({ tag }: { tag: TagDef }) {
  const TagIcon = tag.icon;
  return (
    <Badge variant={tag.variant}>
      <TagIcon weight="bold" aria-hidden="true" />
      {tag.label}
    </Badge>
  );
}

function WeeklyTop({ report }: { report: KnowledgeGapWeeklyReport }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="weekly-top">
      <SectionHeader
        title={<span id="weekly-top">Top da semana</span>}
        description={[
          `${formatDate(report.from)} a ${formatDate(report.to)}`,
          count(report.occurrences, 'lacuna', 'lacunas'),
          count(report.newGroups, 'tema novo', 'temas novos'),
          count(report.closed.covered, 'coberto', 'cobertos'),
          count(report.closed.dismissed, 'descartado', 'descartados'),
        ].join(' · ')}
      />
      {report.top.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma lacuna nos últimos 7 dias.</p>
      ) : (
        <ol aria-label="Lacunas mais frequentes da semana" className="flex flex-col gap-1.5">
          {report.top.map((item, index) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="w-5 text-right text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {topicLabel(item.topic)}
              </span>
              <span className="text-[0.8125rem] text-muted-foreground">
                {syndromeLabel(item.syndrome)}
              </span>
              <span className="text-[0.8125rem] font-medium text-foreground tabular-nums">
                {item.occurrencesInWeek}×
              </span>
              <Tag tag={STATUS_TAG[item.status]} />
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">
        {SOURCE_ORDER.map((source) => `${SOURCE_LABEL[source]}: ${report.bySource[source]}`).join(
          ' · ',
        )}
      </p>
    </section>
  );
}

function QueueRow({
  item,
  onOpen,
}: {
  item: KnowledgeGapQueueItem;
  onOpen: (item: KnowledgeGapQueueItem) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full flex-col gap-1.5 rounded-sm px-2 py-3 text-left transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag tag={SEVERITY_TAG[item.severity]} />
          <Tag tag={STATUS_TAG[item.status]} />
          {item.recurredAfterClose && (
            <Badge variant="warning">
              <ArrowCounterClockwise weight="bold" aria-hidden="true" />
              Voltou a aparecer
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {count(item.occurrences, 'vez', 'vezes')} · 7 dias: {item.occurrencesLast7Days}
          </span>
        </span>
        <span className="line-clamp-2 text-sm text-foreground">{topicLabel(item.topic)}</span>
        <span className="truncate text-[0.8125rem] text-muted-foreground">
          {syndromeLabel(item.syndrome)} · {sourcesLabel(item.sources)} · última em{' '}
          {formatDate(item.lastSeenAt)}
        </span>
      </button>
    </li>
  );
}

function QueueSkeleton() {
  return (
    <div className="divide-y divide-border border-y border-border" role="status" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-2 py-3">
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
      <span className="sr-only">Carregando lacunas…</span>
    </div>
  );
}

function TextList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader as="h3" title={title} />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-foreground">
          {items.map((text) => (
            <li key={text} className="border-l-[3px] border-foreground/15 pl-3">
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Painel de um grupo. Montado com `key` = id: trocar de grupo zera o tema e o
 * motivo em edição.
 */
function GapDetail({
  item,
  draftEnabled,
  onChanged,
}: {
  item: KnowledgeGapQueueItem;
  draftEnabled: boolean;
  onChanged: (updated: KnowledgeGapQueueItem) => void;
}) {
  const [topic, setTopic] = useState(item.topic);
  const [reason, setReason] = useState('');
  const draft = useDraftFromKnowledgeGap();
  const dismiss = useDismissKnowledgeGap();
  const reopen = useReopenKnowledgeGap();
  const busy = draft.isPending || dismiss.isPending || reopen.isPending;
  const actionable = item.status === 'open' || item.status === 'drafting';

  function handleDraft() {
    draft.mutate(
      { id: item.id, body: { topic: topic.trim() || undefined } },
      {
        onSuccess: ({ item: updated, draft: result }) => {
          onChanged(updated);
          const accepted = result.cardIds.length;
          if (accepted > 0) {
            toast.success(
              `Rascunho gerado: ${accepted} ${accepted === 1 ? 'cartão foi' : 'cartões foram'} para revisão.`,
            );
          } else {
            toast.warning(
              'Nenhum cartão passou na checagem de citação. A lacuna continua aberta; ajuste o tema e tente de novo.',
            );
          }
        },
        onError: (err) => toast.error(errorMessage(err, 'Não foi possível gerar o rascunho.')),
      },
    );
  }

  function handleDismiss() {
    dismiss.mutate(
      { id: item.id, body: { reason: reason.trim() } },
      {
        onSuccess: (updated) => {
          onChanged(updated);
          toast.success('Lacuna descartada.');
        },
        onError: (err) => toast.error(errorMessage(err, 'Não foi possível descartar a lacuna.')),
      },
    );
  }

  function handleReopen() {
    reopen.mutate(item.id, {
      onSuccess: (updated) => {
        onChanged(updated);
        toast.success('Lacuna reaberta.');
      },
      onError: (err) => toast.error(errorMessage(err, 'Não foi possível reabrir a lacuna.')),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b border-border pr-12">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tag={SEVERITY_TAG[item.severity]} />
          <Tag tag={STATUS_TAG[item.status]} />
        </div>
        <SheetTitle className="pt-1.5">{topicLabel(item.topic)}</SheetTitle>
        <SheetDescription>
          {count(item.occurrences, 'vez', 'vezes')} desde {formatDate(item.firstSeenAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <PropertyList>
          <PropertyRow label="Síndrome">{syndromeLabel(item.syndrome)}</PropertyRow>
          <PropertyRow label="Ocorrências">
            {item.occurrences} · últimos 7 dias: {item.occurrencesLast7Days}
          </PropertyRow>
          <PropertyRow label="De onde veio">{sourcesLabel(item.sources)}</PropertyRow>
          <PropertyRow label="Última">{formatDate(item.lastSeenAt)}</PropertyRow>
          {item.coveredByCard && (
            <PropertyRow label="Coberta por">
              <Link href={`/cartoes/${item.coveredByCard.id}`} className="text-link hover:underline">
                {item.coveredByCard.topic}
              </Link>
            </PropertyRow>
          )}
          {item.dismissReason && (
            <PropertyRow label="Motivo do descarte">{item.dismissReason}</PropertyRow>
          )}
          {item.draftId && (
            <PropertyRow label="Último rascunho">
              <span className="font-mono text-[0.8125rem]">{item.draftId.slice(0, 8)}</span>
            </PropertyRow>
          )}
        </PropertyList>

        {item.recurredAfterClose && (
          <Alert variant="warning">
            <ArrowCounterClockwise aria-hidden="true" />
            <AlertTitle>Voltou a aparecer depois de fechada</AlertTitle>
            <AlertDescription>
              Houve lacuna nova deste tema depois que ela foi{' '}
              {item.status === 'covered' ? 'coberta' : 'descartada'}. Se o cartão não está sendo
              achado, reabra.
            </AlertDescription>
          </Alert>
        )}

        <TextList
          title="Consultas mais repetidas"
          items={item.queries}
          empty="As lacunas deste grupo não registraram consulta."
        />
        <TextList
          title="O que os médicos disseram que faltou"
          items={item.notes}
          empty="Nenhuma nota."
        />

        {actionable && (
          <section className="flex flex-col gap-2">
            <Label htmlFor="gap-topic">Tema do cartão</Label>
            <Input
              id="gap-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Anafilaxia: adrenalina IM no adulto"
            />
            <p className="text-xs text-muted-foreground">
              {draftEnabled
                ? 'A IA rascunha com citação literal das diretrizes; o cartão só sai depois da revisão médica.'
                : 'Rascunho por IA desligado neste ambiente (KNOWLEDGE_CARDS_DRAFT_ENABLED).'}
            </p>
            <Button
              type="button"
              disabled={!draftEnabled || busy || topic.trim().length < 3}
              onClick={handleDraft}
            >
              <Sparkle aria-hidden="true" />
              {draft.isPending ? 'Gerando rascunho…' : 'Gerar rascunho de cartão'}
            </Button>
          </section>
        )}

        {actionable && (
          <section className="flex flex-col gap-2">
            <Label htmlFor="gap-dismiss-reason">Motivo do descarte</Label>
            <Textarea
              id="gap-dismiss-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={DISMISS_REASON_MAX_CHARS}
              rows={2}
              placeholder="Ex.: fora do escopo do PS; ou: o cartão de anafilaxia já cobre, o portão não achou."
            />
            <p className="text-xs text-muted-foreground">
              Dados pessoais são mascarados ao salvar. A decisão fica na trilha de auditoria.
            </p>
          </section>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-border p-4">
        {actionable && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="max-sm:h-10 max-sm:flex-1"
            disabled={busy || reason.trim().length < 3}
            onClick={handleDismiss}
          >
            <XCircle weight="bold" aria-hidden="true" />
            Descartar
          </Button>
        )}
        {item.status !== 'open' && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="max-sm:h-10 max-sm:flex-1"
            disabled={busy}
            onClick={handleReopen}
          >
            <ArrowCounterClockwise weight="bold" aria-hidden="true" />
            Reabrir
          </Button>
        )}
        {item.status === 'covered' && (
          <span className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
            <CheckCircle aria-hidden="true" />
            Fechada pela publicação do cartão
          </span>
        )}
      </div>
    </div>
  );
}

export default function KnowledgeGapQueuePage() {
  const [statusTab, setStatusTab] = useState<StatusTab>('open');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<KnowledgeGapQueueItem | null>(null);

  const query = useKnowledgeGapQueue({
    status: statusTab === ALL ? undefined : statusTab,
    offset,
    limit: PAGE_SIZE,
  });
  const weekly = useKnowledgeGapWeeklyReport();

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const counts = query.data?.countsByStatus;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  function changeStatusTab(value: string) {
    const tab = STATUS_TABS.find((t) => t.value === value);
    if (!tab) return;
    setStatusTab(tab.value);
    setOffset(0);
  }

  return (
    <Page width="wide">
      <PageHeader
        icon={SealQuestion}
        title="Lacunas de conhecimento"
        description="O que os médicos procuraram e não tinha cartão revisado, agrupado por tema. Mais frequentes e mais graves primeiro."
      />

      {weekly.data ? (
        <WeeklyTop report={weekly.data} />
      ) : weekly.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : null}

      <Tabs value={statusTab} onValueChange={changeStatusTab} className="gap-0">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:border-b sm:border-border">
          <TabsList
            aria-label="Filtrar por status"
            className="max-sm:w-full max-sm:overflow-x-auto sm:border-b-0 max-sm:group-data-horizontal/tabs:h-10"
          >
            {STATUS_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const count = tab.value === ALL ? undefined : counts?.[tab.value];
              return (
                <TabsTrigger key={tab.value} value={tab.value}>
                  <TabIcon aria-hidden="true" />
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className={cn(
                        'ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] px-1 text-xs font-normal tabular-nums',
                        tab.value === 'open'
                          ? 'bg-tone-orange-tag text-tone-orange-ink'
                          : 'bg-tone-gray-tag text-tone-gray-ink',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className="flex items-center gap-1.5 sm:pb-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:size-10"
              aria-label="Atualizar fila"
              onClick={() => {
                void query.refetch();
                void weekly.refetch();
              }}
              disabled={query.isFetching}
            >
              <ArrowClockwise className={cn(query.isFetching && 'animate-spin')} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Tabs>

      {query.isPending ? (
        <QueueSkeleton />
      ) : query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar a fila</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{query.error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <ArrowClockwise aria-hidden="true" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState
            icon={<SealQuestion weight="duotone" />}
            title={statusTab === 'open' ? 'Nenhuma lacuna aberta' : 'Nenhuma lacuna aqui'}
            description={
              statusTab === 'open'
                ? 'Toda dúvida registrada já tem cartão, rascunho ou decisão.'
                : 'Nenhuma lacuna corresponde a este filtro.'
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ul aria-label="Lacunas" className="divide-y divide-border border-y border-border">
            {items.map((item) => (
              <QueueRow key={item.id} item={item} onOpen={setSelected} />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs text-muted-foreground tabular-nums">
              {offset + 1}–{pageEnd} de {total}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <CaretLeft aria-hidden="true" />
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pageEnd >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Próxima
                <CaretRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          {selected && (
            <GapDetail
              key={selected.id}
              item={selected}
              draftEnabled={query.data?.draftEnabled ?? false}
              onChanged={setSelected}
            />
          )}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
