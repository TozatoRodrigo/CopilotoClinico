'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Buildings,
  CalendarBlank,
  CircleDashed,
  ClockCounterClockwise,
  DotsThree,
  FilePlus,
  FileText,
  IdentificationCard,
  ListChecks,
  Microphone,
  SealCheck,
  Tag,
  Warning,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  useEncounterDetail,
  useCancelEncounter,
  useUpdateEncounterVertical,
} from '@/lib/clinical-queries';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { QuickConsultBanner } from '@/components/domain/quick-consult-banner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DecisionThread, type DecisionThreadItem } from '@/components/domain/decision-thread';
import { messages } from '@/lib/messages';
import type { EncounterContext, EncounterDetail, EncounterVertical } from '@/lib/types';
import {
  DOC_TYPE_LABELS,
  docEventTitle,
  encounterTitle,
  formatDateTime,
  formatRelative,
  formatTime,
  getVerticalMeta,
  VERTICAL_OPTIONS,
} from '../_components/encounter-meta';
import { SeverityTag, StatusTag, VerticalTag } from '../_components/encounter-tags';
import { EncounterDetailSkeleton } from './_components/encounter-detail-skeleton';

const CONTEXT_LABELS: Record<string, string> = {
  hasCT: 'TC',
  isSus: 'SUS',
  hasLab: 'Laboratório',
  hasICU: 'UTI',
};

const CASE_STEPS = ['Captura', 'Análise', 'Documento'];

// No celular a coluna de rótulos encolhe para sobrar espaço aos valores.
const PROPERTY_ROW = 'max-sm:grid-cols-[6.75rem_1fr]';

/**
 * Etapa atual do fluxo Captura → Análise → Documento, derivada do que o caso
 * já tem (sem análise = captura; análise sem documento = análise; documento
 * ainda não assinado = documento; assinado = tudo concluído).
 */
function currentCaseStep(encounter: EncounterDetail): number {
  if (encounter.status === 'finalized') return CASE_STEPS.length;
  if ((encounter.documents ?? []).length > 0) return 2;
  if ((encounter.aiInteractions ?? []).length > 0) return 1;
  return 0;
}

export default function EncounterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const encounterQuery = useEncounterDetail(id);
  const cancelEncounter = useCancelEncounter(id);
  const updateVertical = useUpdateEncounterVertical(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const encounter = encounterQuery.data;
  const loading = encounterQuery.isPending;
  const error = encounterQuery.error?.message ?? null;

  async function handleCancel() {
    try {
      await cancelEncounter.mutateAsync();
      toast.success('Caso cancelado.');
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar o caso.');
    }
  }

  // UX-04 — vertical não bloqueia mais a captura (ver encounters/new/page.tsx);
  // esta é a confirmação/correção pós-hoc, sem tirar o médico do fluxo.
  async function handleVerticalChange(value: EncounterVertical) {
    try {
      await updateVertical.mutateAsync(value);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar a vertical do caso.');
    }
  }

  if (loading) {
    return <EncounterDetailSkeleton />;
  }

  if (error || !encounter) {
    return (
      <Page width="narrow" className="items-center gap-5 py-10 text-center md:py-16">
        <WarningCircle weight="duotone" className="size-12 text-tone-red" aria-hidden="true" />
        <div role="alert" className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground">
            {messages.errors.encounterLoadTitle}
          </h1>
          <p className="max-w-md text-[0.9375rem] text-pretty text-muted-foreground">
            {error ?? 'Atendimento não encontrado.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => void encounterQuery.refetch()}>
            {messages.common.actions.tryAgain}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/encounters">{messages.common.actions.backToEncounters}</Link>
          </Button>
        </div>
      </Page>
    );
  }

  const documents = encounter.documents ?? [];
  const interactions = encounter.aiInteractions ?? [];
  const activeContexts = Object.entries(CONTEXT_LABELS).filter(
    ([key]) => encounter.context[key as keyof EncounterContext],
  );

  const timelineItems: DecisionThreadItem[] = buildTimeline(
    encounter.createdAt,
    interactions,
    documents,
  );

  const latestInteraction = interactions[0];
  // S25-QC-01 — título com a mesma regra de fallback já usada no Plantão
  // (chiefComplaint > patientRef); "Consulta rápida" só aparece quando
  // nenhum dos dois existe ainda.
  const displayTitle = encounterTitle(encounter);
  const verticalMeta = getVerticalMeta(encounter.vertical);
  const isFinalized = encounter.status === 'finalized';
  const isCancelled = encounter.status === 'cancelled';
  const canCancel = encounter.status === 'draft' || encounter.status === 'in_review';

  // Ação principal = próximo passo do caso: sem análise, capturar; com
  // análise, revisá-la (capturar de novo vira secundária). Caso finalizado
  // (documento assinado) não oferece nova análise.
  const headerActions = (
    <>
      {!isFinalized && latestInteraction && (
        <Button variant="outline" asChild>
          <Link href={`/encounters/${id}/conversation?novo=1`}>
            <Microphone aria-hidden="true" />
            Reanalisar
          </Link>
        </Button>
      )}
      {!isFinalized && latestInteraction && (
        <Button asChild className="max-md:flex-1">
          <Link href={`/encounters/${id}/conversation`}>
            <Brain aria-hidden="true" />
            Ver análise
          </Link>
        </Button>
      )}
      {!isFinalized && !latestInteraction && (
        <Button asChild className="max-md:flex-1">
          <Link href={`/encounters/${id}/conversation`}>
            <Microphone weight="fill" aria-hidden="true" />
            Analisar
          </Link>
        </Button>
      )}
      {canCancel && (
        // Ação destrutiva rebaixada para o menu "⋯" (padrão do Notion); a
        // confirmação em diálogo continua obrigatória.
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações do caso">
              <DotsThree weight="bold" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem variant="destructive" onSelect={() => setCancelOpen(true)}>
              <XCircle aria-hidden="true" />
              Cancelar caso
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  return (
    <Page width="default">
      <PageHeader
        icon={verticalMeta.icon}
        iconTone={verticalMeta.tone}
        title={displayTitle}
        actions={headerActions}
        properties={
          <PropertyList>
            <PropertyRow icon={IdentificationCard} label="Paciente" className={PROPERTY_ROW}>
              {encounter.patientRef ?? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  Não identificado
                  <Badge variant="secondary">Consulta rápida</Badge>
                </span>
              )}
            </PropertyRow>
            <PropertyRow icon={CircleDashed} label="Status" className={PROPERTY_ROW}>
              {/* S20-I18N-01 — rótulo humano; fallback para o slug apenas em
                  caso de status desconhecido (ver encounter-meta). */}
              <StatusTag status={encounter.status} />
            </PropertyRow>
            <PropertyRow icon={Tag} label="Vertical" className={PROPERTY_ROW}>
              {isFinalized ? (
                // Caso finalizado é imutável (documento assinado) — o backend
                // já rejeita qualquer PATCH aqui, então nem oferecemos a edição.
                <VerticalTag vertical={encounter.vertical} />
              ) : (
                <span className="-my-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Select
                    value={encounter.vertical}
                    onValueChange={(value) => void handleVerticalChange(value as EncounterVertical)}
                    disabled={updateVertical.isPending}
                  >
                    <SelectTrigger
                      size="sm"
                      className="-ml-1.5 border-transparent bg-transparent px-1.5 hover:bg-hover data-[state=open]:bg-hover max-sm:h-10"
                      aria-label="Vertical do caso — inferida automaticamente, confirme ou corrija"
                    >
                      <SelectValue>
                        <VerticalTag vertical={encounter.vertical} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {VERTICAL_OPTIONS.map(({ value }) => (
                        <SelectItem key={value} value={value}>
                          <VerticalTag vertical={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    Inferida automaticamente — confirme ou corrija
                  </span>
                </span>
              )}
            </PropertyRow>
            <PropertyRow icon={Warning} label="Gravidade" className={PROPERTY_ROW}>
              {encounter.highestRedFlagSeverity ? (
                <SeverityTag severity={encounter.highestRedFlagSeverity} />
              ) : (
                <span className="text-muted-foreground">
                  {latestInteraction ? 'Sem red flags na última análise' : 'Aguardando análise'}
                </span>
              )}
            </PropertyRow>
            <PropertyRow icon={Buildings} label="Contexto" className={PROPERTY_ROW}>
              {activeContexts.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {activeContexts.map(([, label]) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">Nenhum recurso marcado</span>
              )}
            </PropertyRow>
            {!isCancelled && (
              <PropertyRow icon={ListChecks} label="Etapa" className={PROPERTY_ROW}>
                <ProgressSteps
                  steps={CASE_STEPS}
                  currentStep={currentCaseStep(encounter)}
                  className="-ml-1.5 text-[0.8125rem] max-sm:hidden"
                />
                <span className="sm:hidden">
                  {CASE_STEPS[currentCaseStep(encounter)] ?? 'Concluído'}
                  <span className="text-muted-foreground">
                    {' '}
                    · {Math.min(currentCaseStep(encounter) + 1, CASE_STEPS.length)} de{' '}
                    {CASE_STEPS.length}
                  </span>
                </span>
              </PropertyRow>
            )}
            <PropertyRow icon={CalendarBlank} label="Criado" className={PROPERTY_ROW}>
              <time dateTime={encounter.createdAt} className="tabular-nums">
                {formatDateTime(encounter.createdAt)}
                <span className="text-muted-foreground"> · {formatRelative(encounter.createdAt)}</span>
              </time>
            </PropertyRow>
            <PropertyRow icon={ClockCounterClockwise} label="Atualizado" className={PROPERTY_ROW}>
              <time
                dateTime={encounter.updatedAt}
                title={formatDateTime(encounter.updatedAt)}
                className="tabular-nums"
              >
                {formatRelative(encounter.updatedAt)}
              </time>
            </PropertyRow>
          </PropertyList>
        }
      />

      {/* S25-QC-01 — banner some assim que o médico identifica o
          paciente (a query é invalidada por useIdentifyEncounterPatient,
          dentro do componente compartilhado). O wrapper zera a margem
          inferior própria do banner — o ritmo vem do gap do <Page>. */}
      {encounter.patientRef === null && (
        <QuickConsultBanner
          encounterId={id}
          description="Este caso ainda não está no seu plantão — identifique o paciente para adicioná-lo à fila."
        />
      )}

      <section aria-labelledby="decision-history-title" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="decision-history-title">Histórico da decisão</span>}
          count={timelineItems.length}
        />
        <DecisionThread items={timelineItems} mode="history" />
      </section>

      <section aria-labelledby="documents-title" className="flex flex-col gap-3">
        <SectionHeader
          title={<span id="documents-title">Documentos</span>}
          count={documents.length > 0 ? documents.length : undefined}
          action={
            documents.length > 0 ? (
              <Link
                href={`/encounters/${id}/documents`}
                className="rounded-sm px-1.5 py-0.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                Abrir documentos →
              </Link>
            ) : undefined
          }
        />
        {documents.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/encounters/${id}/documents/${doc.id}/edit`}
                  className="group flex items-center gap-3 px-2 py-2.5 transition-colors duration-75 outline-none hover:bg-hover/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset"
                >
                  {doc.confirmedBy ? (
                    <SealCheck
                      className="size-4 shrink-0 text-clinical-green"
                      weight="fill"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                    </span>
                    <time
                      dateTime={doc.createdAt}
                      className="text-xs text-muted-foreground tabular-nums"
                    >
                      {formatTime(doc.createdAt)} · {formatRelative(doc.createdAt)}
                    </time>
                  </span>
                  {doc.confirmedBy ? (
                    <Badge variant="success">Confirmado</Badge>
                  ) : (
                    <Badge variant="secondary">Rascunho</Badge>
                  )}
                  <span className="hidden w-14 items-center justify-end gap-1 text-[0.8125rem] text-muted-foreground group-hover:text-foreground sm:inline-flex">
                    {doc.confirmedBy ? 'Ver' : 'Editar'}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 border-y border-border px-2 py-3 text-sm text-muted-foreground">
            <FilePlus className="size-4 shrink-0" aria-hidden="true" />
            {latestInteraction
              ? 'Nenhum documento ainda — gere SOAP, SBAR ou prescrição a partir da análise.'
              : 'Os documentos aparecem aqui depois da análise do copiloto.'}
          </p>
        )}
      </section>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar caso?</DialogTitle>
            <DialogDescription>
              O atendimento de {displayTitle} será marcado como cancelado. Nenhum
              conteúdo é apagado — o histórico permanece disponível na trilha de auditoria, mas o
              caso não poderá mais ser analisado ou ter documentos gerados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelEncounter.isPending}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleCancel()}
              disabled={cancelEncounter.isPending}
              loading={cancelEncounter.isPending}
            >
              {cancelEncounter.isPending ? 'Cancelando…' : 'Cancelar caso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function buildTimeline(
  createdAt: string,
  interactions: Array<{
    id: string;
    model: string;
    uncertainty: boolean;
    uncertaintyReason: string | null;
    latencyMs: number;
    cost: number;
    createdAt: string;
  }>,
  documents: Array<{
    id: string;
    type: string;
    confirmedBy: string | null;
    confirmedAt: string | null;
    contentHash: string | null;
    createdAt: string;
  }>,
): DecisionThreadItem[] {
  const items: DecisionThreadItem[] = [];

  items.push({
    id: 'creation',
    state: 'document',
    icon: FilePlus,
    title: 'Atendimento criado',
    description: 'Paciente registrado no sistema',
    timestamp: `${formatTime(createdAt)} · ${formatRelative(createdAt)}`,
  });

  for (const interaction of [...interactions].reverse()) {
    items.push({
      id: `interaction-${interaction.id}`,
      // Incerteza = o copiloto devolveu perguntas que mudam a conduta
      // (laranja); análise conclusiva fica no azul de IA.
      state: interaction.uncertainty ? 'question' : 'analysis',
      title: interaction.uncertainty ? 'Análise do copiloto · com incerteza' : 'Análise do copiloto',
      description: interaction.uncertainty
        ? `Incerteza: ${interaction.uncertaintyReason ?? 'Evidência insuficiente'}`
        : `Análise concluída (${interaction.latencyMs}ms)`,
      timestamp: `${formatTime(interaction.createdAt)} · ${formatRelative(interaction.createdAt)}`,
    });
  }

  for (const doc of [...documents].reverse()) {
    items.push({
      id: `doc-${doc.id}`,
      state: doc.confirmedBy ? 'conduct' : 'document',
      title: docEventTitle(doc.type, doc.confirmedBy ? 'confirmed' : 'generated'),
      description: doc.confirmedBy
        ? `Documento assinado${doc.contentHash ? ` · hash ${doc.contentHash.slice(0, 8)}…` : ''}`
        : 'Aguardando revisão e confirmação',
      timestamp: `${formatTime(doc.createdAt)} · ${formatRelative(doc.createdAt)}`,
    });
  }

  return items;
}
