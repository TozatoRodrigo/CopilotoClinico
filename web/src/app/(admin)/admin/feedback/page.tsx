'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Books,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  CheckCircle,
  Clock,
  Copy,
  Flag,
  ListBullets,
  SealCheck,
  ThumbsUp,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import { useCopilotFeedbackQueue, useTriageCopilotFeedback } from '@/lib/clinical-queries';
import { ApiError } from '@/lib/api-client';
import type {
  CopilotFeedbackKind,
  CopilotFeedbackStatus,
  CopilotFeedbackTriageItem,
  RetrievalCoverage,
} from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Label } from '@/components/ui/label';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { buildGoldCaseSkeleton, copyText } from '../_lib/gold-case';

/**
 * F0-D — fila de triagem do feedback dos médicos.
 *
 * Origem: os reportes ("cenário errado", "faltou diretriz", "conduta
 * incorreta", "foi útil") ficavam só na trilha de auditoria, sem fila nem
 * estado — e os erros clínicos conhecidos chegavam por WhatsApp. Aqui a
 * curadoria lê o caso como foi analisado, a resposta do copiloto e o rastro
 * técnico, decide o destino do reporte e, quando vale, copia o esqueleto de
 * um caso do gabarito de avaliação.
 */

const PAGE_SIZE = 20;
const ALL = 'all';

type StatusTab = CopilotFeedbackStatus | typeof ALL;
type KindFilter = CopilotFeedbackKind | typeof ALL;

interface TagDef {
  label: string;
  variant: 'warning' | 'blue' | 'success' | 'secondary' | 'destructive' | 'yellow' | 'gray';
  icon: Icon;
}

const STATUS_TABS: { value: StatusTab; label: string; icon: Icon }[] = [
  { value: 'new', label: 'Novos', icon: Clock },
  { value: 'triaged', label: 'Triados', icon: CheckCircle },
  { value: 'converted_to_eval_case', label: 'Viraram caso', icon: SealCheck },
  { value: 'dismissed', label: 'Descartados', icon: XCircle },
  { value: ALL, label: 'Todos', icon: ListBullets },
];

/** Laranja pede ação (novo); verde = virou caso de regressão. Sempre ícone + texto. */
const STATUS_TAG: Record<CopilotFeedbackStatus, TagDef> = {
  new: { label: 'Novo', variant: 'warning', icon: Clock },
  triaged: { label: 'Triado', variant: 'blue', icon: CheckCircle },
  converted_to_eval_case: { label: 'Virou caso do gabarito', variant: 'success', icon: SealCheck },
  dismissed: { label: 'Descartado', variant: 'secondary', icon: XCircle },
};

/** Vermelho = reporte de erro clínico; os demais são categorias. */
const KIND_TAG: Record<CopilotFeedbackKind, TagDef> = {
  wrong_scenario: { label: 'Cenário errado', variant: 'destructive', icon: Flag },
  wrong_recommendation: { label: 'Conduta incorreta', variant: 'destructive', icon: Flag },
  missing_coverage: { label: 'Faltou diretriz', variant: 'yellow', icon: Books },
  helpful: { label: 'Foi útil', variant: 'gray', icon: ThumbsUp },
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: ALL, label: 'Todos os tipos' },
  { value: 'wrong_scenario', label: KIND_TAG.wrong_scenario.label },
  { value: 'wrong_recommendation', label: KIND_TAG.wrong_recommendation.label },
  { value: 'missing_coverage', label: KIND_TAG.missing_coverage.label },
  { value: 'helpful', label: KIND_TAG.helpful.label },
];

const COVERAGE_LABEL: Record<RetrievalCoverage, string> = {
  full: 'A base cobre o cenário',
  partial: 'Cobertura parcial',
  none: 'A base não cobre o cenário',
};

const CRITICALITY_LABEL: Record<string, string> = {
  blocker: 'muda a conduta',
  important: 'importante',
  optional: 'opcional',
};

/** Destinos de um reporte, na ordem em que aparecem no painel. */
const TRIAGE_ACTIONS: { status: CopilotFeedbackStatus; label: string; icon: Icon }[] = [
  { status: 'triaged', label: 'Marcar como triado', icon: CheckCircle },
  { status: 'converted_to_eval_case', label: 'Virou caso do gabarito', icon: SealCheck },
  { status: 'dismissed', label: 'Descartar', icon: XCircle },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id: string): string {
  return id.slice(0, 8);
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

function QueueRow({
  item,
  onOpen,
}: {
  item: CopilotFeedbackTriageItem;
  onOpen: (item: CopilotFeedbackTriageItem) => void;
}) {
  const hypothesis = item.interaction.output.mainHypothesis;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full flex-col gap-1.5 rounded-sm px-2 py-3 text-left transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag tag={KIND_TAG[item.kind]} />
          <Tag tag={STATUS_TAG[item.status]} />
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {formatDateTime(item.createdAt)}
          </span>
        </span>
        <span className="line-clamp-2 text-sm text-foreground">
          {item.comment ?? <span className="text-muted-foreground">Sem comentário do médico</span>}
        </span>
        {hypothesis && (
          <span className="truncate text-[0.8125rem] text-muted-foreground">
            Hipótese do copiloto: {hypothesis}
          </span>
        )}
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
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
      <span className="sr-only">Carregando reportes…</span>
    </div>
  );
}

function ChunkIds({ title, ids }: { title: string; ids: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {title} · {ids.length}
      </p>
      {ids.length === 0 ? (
        <p className="text-[0.8125rem] text-muted-foreground">Nenhum</p>
      ) : (
        <ul className="flex flex-col gap-0.5 font-mono text-xs text-foreground">
          {ids.map((id) => (
            <li key={id} className="break-all">
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Painel de um reporte. Montado com `key` = id: trocar de reporte zera a nota
 * de triagem em edição (mesmo cuidado do motivo de rejeição de CRM).
 */
function FeedbackDetail({
  item,
  onTriaged,
}: {
  item: CopilotFeedbackTriageItem;
  onTriaged: (updated: CopilotFeedbackTriageItem) => void;
}) {
  const [triageNote, setTriageNote] = useState(item.triageNote ?? '');
  const [manualCopyJson, setManualCopyJson] = useState<string | null>(null);
  const triage = useTriageCopilotFeedback();
  const { interaction } = item;
  const { output } = interaction;

  function handleTriage(status: CopilotFeedbackStatus) {
    triage.mutate(
      { id: item.id, body: { status, triageNote: triageNote.trim() || null } },
      {
        onSuccess: (updated) => {
          onTriaged(updated);
          toast.success(`Reporte marcado como “${STATUS_TAG[status].label}”.`);
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar a triagem.');
        },
      },
    );
  }

  // A escrita na área de transferência acontece DENTRO do clique (gesto do
  // usuário) — ver copyText.
  async function handleCopyGoldCase() {
    const json = JSON.stringify(buildGoldCaseSkeleton(item), null, 2);
    if (await copyText(json)) {
      setManualCopyJson(null);
      toast.success('Caso do gabarito copiado. Cole no arquivo de casos e complete o esperado.');
      return;
    }
    setManualCopyJson(json);
    toast.error('Não foi possível copiar automaticamente — copie o JSON abaixo.');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b border-border pr-12">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tag={KIND_TAG[item.kind]} />
          <Tag tag={STATUS_TAG[item.status]} />
        </div>
        <SheetTitle className="pt-1.5">Reporte {shortId(item.id)}</SheetTitle>
        <SheetDescription>Recebido em {formatDateTime(item.createdAt)}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <section className="flex flex-col gap-2" aria-labelledby="feedback-comment">
          <SectionHeader as="h3" title={<span id="feedback-comment">Comentário do médico</span>} />
          {item.comment ? (
            <p className="border-l-[3px] border-foreground/15 pl-3 text-[0.9375rem] whitespace-pre-wrap text-foreground">
              {item.comment}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem comentário.</p>
          )}
        </section>

        <PropertyList>
          <PropertyRow label="Cobertura da base">
            {interaction.retrievalCoverage
              ? COVERAGE_LABEL[interaction.retrievalCoverage]
              : 'Sem registro'}
          </PropertyRow>
          <PropertyRow label="Modelo">
            <span className="font-mono text-[0.8125rem]">{interaction.model}</span>
          </PropertyRow>
          <PropertyRow label="Rodada">{interaction.turnIndex + 1}</PropertyRow>
          <PropertyRow label="Atendimento">
            <span className="font-mono text-[0.8125rem]">{shortId(item.encounterId)}</span>
          </PropertyRow>
          <PropertyRow label="Análise">
            <span className="font-mono text-[0.8125rem]">
              {shortId(interaction.id)} · {formatDateTime(interaction.createdAt)}
            </span>
          </PropertyRow>
        </PropertyList>

        <section className="flex flex-col gap-2" aria-labelledby="feedback-case">
          <SectionHeader
            as="h3"
            title={<span id="feedback-case">Caso como foi analisado</span>}
            description="Texto já com dados pessoais mascarados."
          />
          <p className="max-h-64 overflow-y-auto rounded-md bg-tone-gray-bg px-3 py-2.5 text-sm whitespace-pre-wrap text-foreground">
            {interaction.inputRedacted ?? 'Texto do caso não registrado nesta análise.'}
          </p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="feedback-output">
          <SectionHeader as="h3" title={<span id="feedback-output">O que o copiloto respondeu</span>} />
          <p className="text-sm">
            <span className="text-muted-foreground">Hipótese principal: </span>
            <span className="font-medium text-foreground">
              {output.mainHypothesis ?? 'nenhuma registrada'}
            </span>
            {output.uncertainty && (
              <Badge variant="warning" className="ml-2">
                com incerteza
              </Badge>
            )}
          </p>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Plano · {output.recommendations.length}</p>
            {output.recommendations.length === 0 ? (
              <p className="text-[0.8125rem] text-muted-foreground">Nenhuma conduta sugerida.</p>
            ) : (
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground">
                {output.recommendations.map((rec, index) => (
                  <li key={`${index}-${rec.action}`}>
                    {rec.action}
                    {rec.preliminary && (
                      <span className="text-[0.8125rem] text-muted-foreground"> · preliminar</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
          {output.questions.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Perguntas · {output.questions.length}</p>
              <ul className="flex flex-col gap-1 text-sm text-foreground">
                {output.questions.map((q, index) => (
                  <li key={`${index}-${q.question}`}>
                    {q.question}
                    <span className="text-[0.8125rem] text-muted-foreground">
                      {' '}
                      · {CRITICALITY_LABEL[q.criticality] ?? q.criticality}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <Disclosure
          title="Rastro técnico"
          meta={`${interaction.retrievedChunkIds.length} recuperados · ${interaction.citedChunkIds.length} citados`}
        >
          <div className="flex flex-col gap-3">
            <ChunkIds title="Chunks recuperados" ids={interaction.retrievedChunkIds} />
            <ChunkIds title="Chunks citados" ids={interaction.citedChunkIds} />
          </div>
        </Disclosure>

        <section className="flex flex-col gap-2">
          <Label htmlFor="triage-note">Nota de triagem</Label>
          <Textarea
            id="triage-note"
            value={triageNote}
            onChange={(e) => setTriageNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Ex.: base sem diretriz de dengue — virou campo-1a2b3c4d; ou: análise correta, médico esperava outra conduta."
          />
          <p className="text-xs text-muted-foreground">
            Dados pessoais são mascarados ao salvar. A mudança fica na trilha de auditoria.
          </p>
        </section>

        {manualCopyJson && (
          <section className="flex flex-col gap-2">
            <Label htmlFor="gold-case-json">Caso do gabarito (copie manualmente)</Label>
            <Textarea
              id="gold-case-json"
              readOnly
              value={manualCopyJson}
              rows={10}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
          </section>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-4">
        <Button type="button" variant="outline" onClick={() => void handleCopyGoldCase()}>
          <Copy aria-hidden="true" />
          Copiar como caso do gabarito
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {TRIAGE_ACTIONS.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.status}
                type="button"
                size="sm"
                variant={action.status === 'dismissed' ? 'ghost' : 'default'}
                className="max-sm:h-10 max-sm:flex-1"
                disabled={triage.isPending || item.status === action.status}
                onClick={() => handleTriage(action.status)}
              >
                <ActionIcon weight="bold" aria-hidden="true" />
                {action.label}
              </Button>
            );
          })}
          {item.status !== 'new' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="max-sm:h-10 max-sm:flex-1"
              disabled={triage.isPending}
              onClick={() => handleTriage('new')}
            >
              <ArrowCounterClockwise weight="bold" aria-hidden="true" />
              Reabrir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CopilotFeedbackTriagePage() {
  const [statusTab, setStatusTab] = useState<StatusTab>('new');
  const [kindFilter, setKindFilter] = useState<KindFilter>(ALL);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<CopilotFeedbackTriageItem | null>(null);

  const query = useCopilotFeedbackQueue({
    status: statusTab === ALL ? undefined : statusTab,
    kind: kindFilter === ALL ? undefined : kindFilter,
    offset,
    limit: PAGE_SIZE,
  });

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

  function changeKind(value: string) {
    const option = KIND_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    setKindFilter(option.value);
    setOffset(0);
  }

  return (
    <Page width="wide">
      <PageHeader
        icon={ChatCircleText}
        title="Feedback dos médicos"
        description="Reportes sobre análises do copiloto — cenário errado, faltou diretriz, conduta incorreta, foi útil. Cada decisão de triagem fica na trilha de auditoria."
      />

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
                        tab.value === 'new'
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
            <Select value={kindFilter} onValueChange={changeKind}>
              <SelectTrigger
                aria-label="Filtrar por tipo de reporte"
                size="sm"
                className="w-full text-[0.8125rem] sm:w-48 max-sm:h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:size-10"
              aria-label="Atualizar fila"
              onClick={() => void query.refetch()}
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
            icon={<ChatCircleText weight="duotone" />}
            title={statusTab === 'new' ? 'Fila zerada' : 'Nenhum reporte aqui'}
            description={
              statusTab === 'new'
                ? 'Nenhum reporte novo esperando triagem.'
                : 'Nenhum reporte corresponde a este filtro.'
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ul
            aria-label="Reportes de feedback"
            className="divide-y divide-border border-y border-border"
          >
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
          {selected && <FeedbackDetail key={selected.id} item={selected} onTriaged={setSelected} />}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
