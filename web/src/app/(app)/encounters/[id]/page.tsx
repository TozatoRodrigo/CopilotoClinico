'use client';

import { use, useState } from 'react';
import { useEncounterDetail, useCancelEncounter } from '@/lib/clinical-queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { DecisionThread, type DecisionThreadItem } from '@/components/domain/decision-thread';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { ArrowLeft, Microphone, Brain, FileText, ArrowRight, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { EncounterContext } from '@/lib/types';

const CONTEXT_LABELS: Record<string, string> = {
  hasCT: 'TC',
  isSus: 'SUS',
  hasLab: 'Laboratório',
  hasICU: 'UTI',
};

// S20-I18N-01 — localização do status do atendimento. Antes mostrava o slug
// cru (in_review, draft...) como rótulo — única tela não-localizada do app.
const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  finalized: 'Finalizado',
  cancelled: 'Cancelado',
  signed: 'Assinado',
};

const STATUS_VARIANTS: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  draft: 'outline',
  in_review: 'secondary',
  finalized: 'default',
  cancelled: 'destructive',
  signed: 'default',
};

const VERTICAL_LABELS: Record<string, string> = {
  trauma: 'Trauma',
  cardiac: 'Cardíaco',
  pediatric: 'Pediátrico',
  neuro: 'Neuro',
  general: 'Geral',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  soap: 'SOAP',
  sbar: 'SBAR',
  prescricao: 'Prescrição',
  alta: 'Alta',
  atestado: 'Atestado',
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EncounterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const encounterQuery = useEncounterDetail(id);
  const cancelEncounter = useCancelEncounter(id);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <Skeleton className="h-8 w-64 rounded" />
          <div className="mt-8 space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !encounter) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Alert variant="destructive">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error ?? 'Atendimento não encontrado.'}</span>
              <Button variant="outline" size="sm" onClick={() => void encounterQuery.refetch()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-clinical-paper">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* S22-NAV-01 — breadcrumb (a página atual é o próprio paciente). */}
        <Breadcrumb
          items={[
            { label: 'Atendimentos', href: '/encounters' },
            { label: encounter.patientRef },
          ]}
        />
        <header className="flex items-center justify-between pb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-9">
              <Link href="/encounters">
                <ArrowLeft className="mr-1 size-4" />
                Voltar
              </Link>
            </Button>
            <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
              {encounter.patientRef}
            </h1>
            <Badge variant={STATUS_VARIANTS[encounter.status] ?? 'secondary'}>
              {/* S20-I18N-01 — rótulo humano; fallback para o slug apenas em caso
                  de status desconhecido (manter legível, não mostrar snake_case cru). */}
              {STATUS_LABELS[encounter.status] ?? encounter.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {encounter.status !== 'finalized' && (
              <Button asChild className="h-11">
                <Link href={`/encounters/${id}/capture`}>
                  <Microphone className="mr-2 size-4" />
                  Analisar
                </Link>
              </Button>
            )}
            {latestInteraction && encounter.status !== 'finalized' && (
              <Button variant="outline" asChild className="h-11">
                <Link href={`/encounters/${id}/result`}>
                  <Brain className="mr-2 size-4" />
                  Resultado
                </Link>
              </Button>
            )}
            {(encounter.status === 'draft' || encounter.status === 'in_review') && (
              <Button
                variant="destructive"
                className="h-11"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="mr-2 size-4" />
                Cancelar caso
              </Button>
            )}
          </div>
        </header>

        <div className="mb-6 flex flex-wrap gap-3">
          <Badge variant="outline">
            {VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}
          </Badge>
          {activeContexts.map(([, label]) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
          <span className="self-center font-mono text-xs text-muted-foreground">
            {formatTime(encounter.createdAt)} · {formatRelative(encounter.createdAt)}
          </span>
        </div>

        <section className="space-y-2 pb-8">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Histórico da Decisão
          </h2>
          <DecisionThread items={timelineItems} mode="history" />
        </section>

        {documents.length > 0 && (
          <section className="space-y-3 border-t border-clinical-line pt-6">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Documentos
            </h2>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-clinical-line bg-white/60 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatTime(doc.createdAt)} · {formatRelative(doc.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {doc.confirmedBy ? (
                    <Badge variant="success">Confirmado</Badge>
                  ) : (
                    <Badge variant="outline">Rascunho</Badge>
                  )}
                  <Link
                    href={`/encounters/${id}/documents/${doc.id}/edit`}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-clinical-line px-3 text-xs text-foreground hover:border-clinical-teal hover:text-clinical-teal"
                  >
                    {doc.confirmedBy ? 'Ver' : 'Editar'}
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar caso?</DialogTitle>
            <DialogDescription>
              O atendimento de {encounter.patientRef} será marcado como cancelado. Nenhum
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
    </div>
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
    state: 'analysis',
    title: 'Atendimento criado',
    description: 'Paciente registrado no sistema',
    timestamp: `${formatTime(createdAt)} · ${formatRelative(createdAt)}`,
  });

  for (const interaction of [...interactions].reverse()) {
    items.push({
      id: `interaction-${interaction.id}`,
      state: 'analysis',
      title: 'Análise do copiloto',
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
      title: doc.confirmedBy
        ? `${DOC_TYPE_LABELS[doc.type] ?? doc.type} confirmado`
        : `${DOC_TYPE_LABELS[doc.type] ?? doc.type} gerado`,
      description: doc.confirmedBy
        ? `Documento assinado${doc.contentHash ? ` · hash ${doc.contentHash.slice(0, 8)}…` : ''}`
        : 'Aguardando revisão e confirmação',
      timestamp: `${formatTime(doc.createdAt)} · ${formatRelative(doc.createdAt)}`,
    });
  }

  return items;
}
