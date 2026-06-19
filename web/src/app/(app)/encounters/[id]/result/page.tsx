'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useGenerateDocument } from '@/lib/clinical-queries';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { DecisionThread } from '@/components/copilot/decision-thread';
import { STORAGE_KEY_PREFIX, type StoredCopilotResult } from '@/hooks/use-copilot-conversation';
import { messages } from '@/lib/messages';
import type { CopilotAnalysis, DocumentType, LatestInteractionResponse } from '@/lib/types';
import { FileText, ArrowsClockwise, ArrowLeft, CircleNotch } from '@phosphor-icons/react';

const DOCUMENT_TYPES: { type: DocumentType; label: string }[] = [
  { type: 'soap', label: 'SOAP' },
  { type: 'sbar', label: 'SBAR' },
  { type: 'prescricao', label: 'Prescrição' },
  { type: 'alta', label: 'Alta' },
  { type: 'atestado', label: 'Atestado' },
];

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encounterId } = use(params);
  const router = useRouter();
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const generateDocument = useGenerateDocument(encounterId);

  const resultQuery = useQuery({
    queryKey: ['latest-interaction-result', encounterId],
    initialData: () => {
      try {
        const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${encounterId}`);
        return stored ? (JSON.parse(stored) as StoredCopilotResult) : undefined;
      } catch {
        return undefined;
      }
    },
    queryFn: async (): Promise<StoredCopilotResult> => {
      const data = await apiClient.get<LatestInteractionResponse>(
        `/encounters/${encounterId}/copilot/latest`,
      );
      const analysis: CopilotAnalysis = {
        ...data.output,
        citations: data.citations,
        uncertainty: data.uncertainty,
        uncertaintyReason: data.uncertaintyReason,
      };
      const stored: StoredCopilotResult = {
        interactionId: data.interactionId,
        analysis,
      };
      try {
        sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${encounterId}`, JSON.stringify(stored));
      } catch {
        // storage quota — non-critical
      }
      return stored;
    },
  });

  const result = resultQuery.data ?? null;
  const loading = resultQuery.isPending;
  const fetchError = resultQuery.error?.message ?? null;

  async function handleGenerateDocument(type: DocumentType) {
    if (!result) return;
    setGeneratingDoc(type);
    setDocError(null);

    try {
      const doc = await generateDocument.mutateAsync({
        type,
        aiInteractionId: result.interactionId,
      });
      // S23-CLIN-05 — gerar sem sair: abre o documento em nova aba (com
      // rel=noopener/noreferrer) e mantém o médico na tela de resultado.
      // Antes era `router.push` que tirava o médico do contexto da análise,
      // obrigando a voltar para gerar outro documento (SOAP + Prescrição).
      window.open(
        `/encounters/${encounterId}/documents/${doc.id}/edit`,
        '_blank',
        'noopener,noreferrer',
      );
      // Toast confirmação (visual feedback imediato sem sair da tela).
      // Mensagem curta para não competir com o conteúdo clínico.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { toast } = await import('sonner');
      toast.success(messages.documents.generated(type));
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.documents.errorGenerate;
      setDocError(message);
    } finally {
      setGeneratingDoc(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="flex items-center justify-between pb-6">
            <Skeleton className="h-7 w-52 rounded" />
            <Skeleton className="h-5 w-24 rounded" />
          </div>
          <div className="flex gap-4 pb-6">
            <Skeleton className="h-5 w-28 rounded" />
            <Skeleton className="h-5 w-20 rounded" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
          <div className="mt-8 space-y-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (fetchError || !result) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="space-y-4 py-12 text-center">
            {fetchError && (
              <Alert variant="destructive" className="text-left">
                <AlertTitle>{messages.errors.analysisLoadTitle}</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{fetchError}</span>
                  <Button variant="outline" size="sm" onClick={() => void resultQuery.refetch()}>
                    {messages.common.actions.tryAgain}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <p className="text-muted-foreground">{messages.errors.analysisEmpty}</p>
            <Button asChild>
              {/* S22-NAV-01 — Link em vez de <a href> (evita reload). */}
              <Link href={`/encounters/${encounterId}/capture`}>
                {messages.common.actions.goToAnalysis}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasPreliminary = result.analysis.recommendations.some((r) => r.preliminary);
  const allRecommendations = result.analysis.recommendations;
  const definitiveCount = allRecommendations.filter((r) => !r.preliminary).length;

  return (
    <div className="min-h-screen bg-clinical-paper">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* S22-NAV-01 — breadcrumb no fluxo de atendimento. */}
        <Breadcrumb
          items={[
            { label: 'Atendimentos', href: '/encounters' },
            { label: encounterId.slice(0, 8), href: `/encounters/${encounterId}` },
            { label: 'Resultado' },
          ]}
        />
        <header className="flex items-center justify-between pb-6">
          <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
            {messages.copilot.result.title}
          </h1>
          <Badge variant="secondary">
            {messages.copilot.result.recommendationsCount(allRecommendations.length)}
          </Badge>
        </header>

        {hasPreliminary && (
          <p className="pb-4 font-mono text-xs text-muted-foreground">
            {messages.copilot.result.preliminarySummary(definitiveCount, allRecommendations.length - definitiveCount)}
          </p>
        )}

        <DecisionThread encounterId={encounterId} initial={result} />

        {docError && (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>{messages.documents.errorTitle}</AlertTitle>
            <AlertDescription>{docError}</AlertDescription>
          </Alert>
        )}

        <footer className="mt-8 border-t border-clinical-line pt-6">
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {messages.documents.generateHeading}
          </p>
          <div className="flex flex-wrap gap-2">
            {/*
              S23-CLIN-05 — spinner individual. Antes todos os botões
              desabilitavam quando 1 gerava (disabled={generatingDoc !== null}),
              travando o médico de gerar SOAP + Prescrição em paralelo.
              Agora só o botão clicado fica disabled com spinner; os demais
              continuam clicáveis. Geração abre em nova aba (sem sair).
            */}
            {DOCUMENT_TYPES.map((dt) => {
              const isThisGenerating = generatingDoc === dt.type;
              return (
                <Button
                  key={dt.type}
                  onClick={() => handleGenerateDocument(dt.type)}
                  disabled={isThisGenerating}
                  variant={isThisGenerating ? 'default' : 'outline'}
                  className="h-11"
                >
                  {isThisGenerating ? (
                    <CircleNotch className="mr-2 size-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 size-4" />
                  )}
                  {isThisGenerating ? messages.documents.generating : dt.label}
                </Button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3">
            {/* S22-NAV-01 / S23-CLIN-07 — <Link> em vez de <a href> (sem reload). */}
            <Button variant="outline" asChild className="h-11">
              <Link href={`/encounters/${encounterId}/capture`}>
                <ArrowsClockwise className="mr-2 size-4" />
                {messages.documents.newAnalysis}
              </Link>
            </Button>
            <Button variant="ghost" asChild className="h-11 ml-auto">
              <Link href={`/encounters/${encounterId}`}>
                <ArrowLeft className="mr-2 size-4" />
                {messages.documents.encounter}
              </Link>
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
