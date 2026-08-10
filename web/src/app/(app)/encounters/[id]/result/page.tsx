'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useGenerateDocument } from '@/lib/clinical-queries';
import {
  useCopilotConversation,
  STORAGE_KEY_PREFIX,
  type StoredCopilotResult,
} from '@/hooks/use-copilot-conversation';
import { useRecommendationDecisions } from '@/hooks/use-recommendation-decisions';
import { apiClient } from '@/lib/api-client';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { BlockerQuestionCard } from '@/components/domain/blocker-question-card';
import { UncertaintyBanner } from '@/components/domain/uncertainty-banner';
import { useMessages } from '@/lib/messages/use-messages';
import type { Messages } from '@/lib/messages';
import {
  ArrowLeft,
  ArrowsClockwise,
  Sparkle,
  PencilSimple,
  LockSimple,
  FileText,
  CircleNotch,
  WarningCircle,
  SealCheck,
  XCircle,
  PhoneCall,
} from '@phosphor-icons/react';
import type {
  ClarifyingAnswerValue,
  ClarifyingQuestion,
  CopilotAnalysis,
  CopilotRecommendation,
  DocumentType,
  LatestInteractionResponse,
  RedFlagSeverity,
} from '@/lib/types';
import type {
  RecommendationDecisionState,
} from '@/hooks/use-recommendation-decisions';

const DOCUMENT_TYPES: { type: DocumentType; label: string; primary?: boolean }[] = [
  { type: 'soap', label: 'SOAP', primary: true },
  { type: 'sbar', label: 'SBAR' },
  { type: 'prescricao', label: 'Prescrição' },
  { type: 'alta', label: 'Alta' },
  { type: 'atestado', label: 'Atestado' },
];

// UX — 3 baldes fixos do redesign (Redesign.dc.html): AGORA (estabilização
// imediata), EM SEGUIDA (conduta terapêutica) e SE PIORAR (o que observar /
// diagnóstico de acompanhamento). "diagnostic"/"verify" e qualquer categoria
// não mapeada caem em SE PIORAR — mesmo comportamento de fallback que a
// railFor() anterior já tinha para category desconhecida.
type Bucket = 'now' | 'next' | 'watch';

const BUCKET_DEFS: Record<
  Bucket,
  { label: string; hint: string; chipClass: string }
> = {
  now: {
    label: 'AGORA',
    hint: 'primeiros 10 minutos',
    chipClass: 'bg-clinical-error text-white',
  },
  next: {
    label: 'EM SEGUIDA',
    hint: 'confirma e encaminha',
    chipClass: 'bg-clinical-teal-tint text-clinical-teal-deep',
  },
  watch: {
    label: 'SE PIORAR',
    hint: 'o que observar e quando pedir ajuda',
    chipClass: 'bg-clinical-amber-bg text-clinical-amber-foreground',
  },
};

function bucketFor(category?: string): Bucket {
  if (category === 'stabilization') return 'now';
  if (category === 'therapeutic') return 'next';
  return 'watch';
}

const HYPOTHESIS_TONE = {
  error: {
    border: 'border-clinical-error/35',
    bg: 'bg-clinical-error-bg',
    label: 'text-clinical-error',
    heading: 'text-clinical-error-foreground',
    body: 'text-clinical-error-foreground/85',
  },
  amber: {
    border: 'border-clinical-amber/40',
    bg: 'bg-clinical-amber-bg',
    label: 'text-clinical-amber',
    heading: 'text-clinical-amber-foreground',
    body: 'text-clinical-amber-foreground/85',
  },
  neutral: {
    border: 'border-clinical-line',
    bg: 'bg-card',
    label: 'text-clinical-teal',
    heading: 'text-clinical-ink',
    body: 'text-clinical-ink-soft',
  },
} as const;

const SEVERITY_RANK: Record<RedFlagSeverity, number> = { critical: 3, high: 2, moderate: 1 };

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encounterId } = use(params);
  const messages = useMessages();

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
        turnIndex: data.turnIndex,
        maxTurns: data.maxTurns,
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

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-clinical-line bg-card px-5">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-5 w-40 rounded" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[460px_1fr]">
          <div className="border-r border-clinical-line p-7">
            <Skeleton className="mb-6 h-4 w-24 rounded" />
            <Skeleton className="mb-3 h-7 w-56 rounded" />
            <div className="space-y-4">
              {Array.from({ length: 2 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          </div>
          <div className="p-7">
            <Skeleton className="mb-2 h-4 w-32 rounded" />
            <Skeleton className="mb-6 h-7 w-44 rounded" />
            <div className="space-y-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-[14px]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError || !result) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4 text-center">
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
            <Link href={`/encounters/${encounterId}/capture`}>
              {messages.common.actions.goToAnalysis}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // UX-08 — key força remontagem quando o turno mais recente do servidor
  // muda (ex.: refetch em background traz um turno mais novo que o
  // cacheado no sessionStorage). Sem isto, useCopilotConversation()
  // inicializa seu estado interno UMA VEZ a partir de `result` e nunca
  // resincroniza — o médico veria o turno antigo mesmo depois do fetch
  // trazer o novo, porque React não sabe que precisa reconstruir o hook.
  return <ResultView key={result.interactionId} encounterId={encounterId} result={result} />;
}

function ResultView({
  encounterId,
  result,
}: {
  encounterId: string;
  result: StoredCopilotResult;
}) {
  const messages = useMessages();
  const { analysis, answers, setAnswer, reanalyze, reanalyzing, canReanalyze, respondError } =
    useCopilotConversation(encounterId, result);
  const { decisions, setDecision, setNote } = useRecommendationDecisions(
    encounterId,
    analysis.recommendations.length,
  );
  const generateDocument = useGenerateDocument(encounterId);
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  async function handleGenerateDocument(type: DocumentType) {
    if (!result) return;
    setGeneratingDoc(type);
    setDocError(null);

    try {
      const doc = await generateDocument.mutateAsync({
        type,
        aiInteractionId: result.interactionId,
      });
      window.open(
        `/encounters/${encounterId}/documents/${doc.id}/edit`,
        '_blank',
        'noopener,noreferrer',
      );
      const { toast } = await import('sonner');
      toast.success(messages.documents.generated(type));
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.documents.errorGenerate;
      setDocError(message);
    } finally {
      setGeneratingDoc(null);
    }
  }

  const questions = analysis.clarifyingQuestions;
  const criticalQuestions = questions.filter((q) => q.criticality !== 'optional');
  const optionalQuestions = questions.filter((q) => q.criticality === 'optional');
  const recommendations = analysis.recommendations;
  const definitiveCount = recommendations.filter((r) => !r.preliminary).length;
  const preliminaryCount = recommendations.length - definitiveCount;
  // UX-08 — pergunta blocker sem resposta (não só "sem clicar em
  // Reanalisar") é o sinal de que o plano ainda não reflete dados que MUDAM
  // A CONDUTA. Não bloqueia gerar o documento — pode haver razão legítima
  // (handoff preliminar) — mas avisa antes, já que uma vez assinado o
  // documento entra na trilha de auditoria imutável.
  const hasUnansweredBlocker = questions.some(
    (q) => q.criticality === 'blocker' && answers[q.id] === undefined,
  );

  // UX — card "Hipótese principal": tom acompanha a red flag mais grave
  // (mesma regra de cor com significado fixo do design system — âmbar/erro
  // nunca são decorativos aqui). Sem red flags, fica neutro.
  const topSeverity = analysis.redFlags.reduce<RedFlagSeverity | null>((acc, flag) => {
    if (!acc || SEVERITY_RANK[flag.severity] > SEVERITY_RANK[acc]) return flag.severity;
    return acc;
  }, null);
  const hypothesisTone =
    topSeverity === 'critical' ? 'error' : topSeverity === 'high' ? 'amber' : 'neutral';
  const toneClasses = HYPOTHESIS_TONE[hypothesisTone];
  const topHypothesis = analysis.differentials[0]?.hypothesis;
  const otherDifferentials = analysis.differentials.slice(1);

  const buckets: { key: Bucket; items: { rec: CopilotRecommendation; index: number }[] }[] = (
    ['now', 'next', 'watch'] as const
  ).map((key) => ({
    key,
    items: recommendations
      .map((rec, index) => ({ rec, index }))
      .filter(({ rec }) => bucketFor(rec.category) === key),
  }));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-clinical-line bg-card px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/encounters/${encounterId}`}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-clinical-ink"
          >
            <ArrowLeft className="size-4" weight="bold" />
            Fila
          </Link>
          <span className="h-4 w-px bg-clinical-line" aria-hidden="true" />
          <span className="font-mono text-xs text-muted-foreground">
            {encounterId.slice(0, 8)}
          </span>
        </div>
        <ProgressSteps steps={['Captura', 'Análise', 'Documento']} currentStep={1} />
      </header>

      {/* Hipótese principal — sempre presente (reasoning é obrigatório no
          schema); tom e chips de red flag comunicam a urgência real do caso. */}
      <div className={`shrink-0 border-b px-5 py-4 sm:px-7 ${toneClasses.border} ${toneClasses.bg}`}>
        <p className={`font-mono text-[0.6875rem] font-bold uppercase tracking-wider ${toneClasses.label}`}>
          Hipótese principal
        </p>
        <h1 className={`mt-1 font-display text-[1.5rem] leading-tight ${toneClasses.heading}`}>
          {topHypothesis ?? 'Avaliação clínica em andamento'}
        </h1>
        <p className={`mt-1.5 text-sm leading-relaxed ${toneClasses.body}`}>{analysis.reasoning}</p>
        {analysis.redFlags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {analysis.redFlags.map((flag, i) => (
              <RedFlagBadge key={`${flag.finding}-${i}`} finding={flag.finding} severity={flag.severity} />
            ))}
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[460px_1fr]">
        <aside className="flex flex-col gap-5 overflow-y-auto border-r border-clinical-line p-7">
          <div>
            <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Antes de decidir
            </p>
            <h1 className="mt-1 flex items-center gap-2 font-display text-[1.625rem] leading-tight text-clinical-ink">
              <Sparkle className="size-5 text-clinical-teal" weight="fill" />
              O copiloto precisa saber
            </h1>
          </div>

          {respondError && (
            <Alert variant="destructive">
              <AlertTitle>{messages.copilot.reanalyze.errorTitle}</AlertTitle>
              <AlertDescription>{respondError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4">
            {criticalQuestions.map((q) => (
              <BlockerQuestionCard key={q.id} question={q.question} why={q.why}>
                <AnswerControl
                  question={q}
                  value={answers[q.id]}
                  onChange={(value) => setAnswer(q.id, value)}
                  variant="critical"
                  messages={messages}
                />
              </BlockerQuestionCard>
            ))}

            {optionalQuestions.map((q) => (
              <div key={q.id} className="rounded-[14px] border border-clinical-line bg-card p-4">
                <p className="text-[0.9375rem] font-semibold text-clinical-ink">{q.question}</p>
                <p className="mb-2 font-mono text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                  Opcional · refina a análise
                </p>
                <AnswerControl
                  question={q}
                  value={answers[q.id]}
                  onChange={(value) => setAnswer(q.id, value)}
                  variant="optional"
                  messages={messages}
                />
              </div>
            ))}
          </div>

          <Button
            onClick={() => void reanalyze()}
            disabled={!canReanalyze}
            className="h-13 w-full gap-2 bg-clinical-teal text-white hover:bg-clinical-teal-deep"
          >
            {reanalyzing ? (
              <CircleNotch className="size-4 animate-spin" weight="bold" />
            ) : (
              <ArrowsClockwise className="size-4" weight="bold" />
            )}
            {reanalyzing ? messages.copilot.reanalyze.loading : messages.copilot.reanalyze.cta}
          </Button>

          {otherDifferentials.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-dashed border-clinical-line pt-5">
              <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {messages.copilot.differentials.heading}
              </p>
              {otherDifferentials.map((d, i) => (
                <div key={i} className="border-l-[3px] border-clinical-line pl-3">
                  <p className="text-sm font-semibold text-clinical-ink">{d.hypothesis}</p>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                    {d.whatDistinguishes}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="flex flex-col gap-4 overflow-y-auto p-7">
          <div>
            <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {`Recomendações · ${recommendations.length}`}
            </p>
            <h2 className="mt-1 font-display text-[1.625rem] leading-tight text-clinical-ink">
              Plano sugerido
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.copilot.result.preliminarySummary(definitiveCount, preliminaryCount)}
            </p>
          </div>

          {analysis.uncertainty && (
            <UncertaintyBanner
              reason={analysis.uncertaintyReason}
              guidelinesHref={`/guidelines?q=${encodeURIComponent(analysis.uncertaintyReason ?? analysis.reasoning ?? '')}`}
            />
          )}

          <div className="flex flex-col gap-6">
            {buckets.map((bucket) => {
              if (bucket.items.length === 0) return null;
              const def = BUCKET_DEFS[bucket.key];
              return (
                <div key={bucket.key} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 font-mono text-[0.6875rem] font-bold tracking-wider ${def.chipClass}`}
                    >
                      {def.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{def.hint}</span>
                    <span className="h-px flex-1 bg-clinical-line" />
                  </div>
                  <div className="flex flex-col gap-3">
                    {bucket.items.map(({ rec, index }) => {
                      const recId = String(index);
                      return (
                        <RecommendationItem
                          key={recId}
                          rec={rec}
                          index={index}
                          decision={decisions[recId]}
                          onAdopt={() => setDecision(recId, 'adopted')}
                          onReject={() => setDecision(recId, 'rejected')}
                          onNote={(note) => setNote(recId, note)}
                          confidenceLabel={messages.recommendation.confidence(rec.confidence)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-clinical-line bg-card px-[18px] py-4">
            <PhoneCall className="size-5 shrink-0 text-clinical-teal" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-clinical-ink">Quer segunda opinião?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Manda o resumo SBAR pronto para o plantonista sênior ou para a hemodinâmica.
              </p>
            </div>
            <Button
              variant="outline"
              className="h-10 shrink-0 gap-2"
              onClick={() => handleGenerateDocument('sbar')}
              disabled={generatingDoc === 'sbar'}
            >
              {generatingDoc === 'sbar' ? (
                <CircleNotch className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              Gerar SBAR
            </Button>
          </div>

          <footer className="mt-2 border-t border-clinical-line pt-5">
            {hasUnansweredBlocker && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-clinical-amber/40 bg-clinical-amber-bg px-3 py-2 text-xs text-clinical-amber-foreground">
                <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" />
                <span>
                  Há uma pergunta que muda a conduta ainda sem resposta — o documento gerado agora
                  não vai refletir essa informação.
                </span>
              </div>
            )}
            <p className="mb-3 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {messages.documents.generateHeading}:
            </p>
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_TYPES.map((dt) => {
                const isThisGenerating = generatingDoc === dt.type;
                return (
                  <Button
                    key={dt.type}
                    onClick={() => handleGenerateDocument(dt.type)}
                    disabled={isThisGenerating}
                    variant={dt.primary && !isThisGenerating ? 'default' : 'outline'}
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
            {docError && (
              <Alert variant="destructive" className="mt-3">
                <AlertTitle>{messages.documents.errorTitle}</AlertTitle>
                <AlertDescription>{docError}</AlertDescription>
              </Alert>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
}

function RedFlagBadge({
  finding,
  severity,
}: {
  finding: string;
  severity: RedFlagSeverity;
}) {
  const styles =
    severity === 'critical'
      ? 'bg-clinical-error-bg text-clinical-error-foreground'
      : severity === 'high'
        ? 'bg-clinical-amber-bg text-clinical-amber-foreground'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${styles}`}
    >
      {severity === 'critical' && <WarningCircle className="size-3" weight="fill" />}
      {finding}
    </span>
  );
}

/**
 * UX-09 — bug relatado ao vivo por um médico do piloto: só "Adotar"
 * funcionava. "Rejeitar" na verdade chamava setDecision('rejected')
 * corretamente, mas a UI não dava NENHUM feedback visual (sem badge, sem
 * diferença nos botões) — parecia não ter feito nada. "Anotar" não tinha
 * onClick nenhum — não fazia literalmente nada, apesar do hook
 * useRecommendationDecisions já suportar setNote() de ponta a ponta.
 * Extraído em componente próprio (em vez de inline no .map()) porque cada
 * item precisa do seu próprio estado local de "nota está expandida" — não
 * dá para usar useState dentro de um .map() do componente pai.
 */
export function RecommendationItem({
  rec,
  index,
  decision,
  onAdopt,
  onReject,
  onNote,
  confidenceLabel,
}: {
  rec: CopilotRecommendation;
  index: number;
  decision: RecommendationDecisionState | undefined;
  onAdopt: () => void;
  onReject: () => void;
  onNote: (note: string) => void;
  confidenceLabel: string;
}) {
  const [showNote, setShowNote] = useState(false);
  const isAdopted = decision?.decision === 'adopted';
  const isRejected = decision?.decision === 'rejected';

  return (
    <div
      className={[
        'flex-1 rounded-[14px] border bg-card p-5',
        isRejected
          ? 'border-clinical-line opacity-60'
          : rec.preliminary
            ? 'border-dashed border-clinical-line opacity-55'
            : 'border-clinical-line',
      ].join(' ')}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3
          className={[
            'text-[0.9375rem] font-semibold leading-snug text-clinical-ink',
            isRejected && 'line-through',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {rec.action}
        </h3>
        {rec.preliminary && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-clinical-amber-bg px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-clinical-amber-foreground">
            <LockSimple className="size-3" weight="fill" />
            Preliminar
          </span>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-muted-foreground">
          {confidenceLabel}
        </span>
        {isAdopted && (
          <span className="flex items-center gap-1 rounded-md border border-clinical-green/30 bg-clinical-green-bg px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-clinical-green-foreground">
            <SealCheck className="size-3" weight="fill" />
            Adotada
          </span>
        )}
        {isRejected && (
          <span className="flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-destructive">
            <XCircle className="size-3" weight="fill" />
            Rejeitada
          </span>
        )}
      </div>

      <p className="mb-3 text-[0.84375rem] leading-relaxed text-muted-foreground">
        {rec.rationale}
      </p>

      <p className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
        <span className="font-mono font-semibold text-clinical-teal">[{index + 1}]</span>
        <span className="truncate">{rec.source}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={onAdopt}
          className={
            isAdopted
              ? 'bg-clinical-ink text-white hover:bg-clinical-ink/90'
              : 'bg-transparent text-clinical-ink border border-clinical-line hover:bg-muted'
          }
        >
          Adotar
        </Button>
        <Button
          size="sm"
          variant={isRejected ? 'destructive' : 'outline'}
          onClick={onReject}
        >
          Rejeitar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowNote((s) => !s)}>
          <PencilSimple className="size-3.5" />
          {decision?.note ? 'Editar nota' : 'Anotar'}
        </Button>
      </div>

      {showNote && (
        <div className="mt-3">
          <Textarea
            aria-label={`Anotação para: ${rec.action}`}
            value={decision?.note ?? ''}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Observação clínica sobre esta recomendação..."
            className="min-h-[60px] resize-y bg-white text-sm"
            rows={2}
          />
        </div>
      )}
      {decision?.note && !showNote && (
        <p className="mt-3 text-[0.75rem] italic text-muted-foreground">
          &ldquo;{decision.note}&rdquo;
        </p>
      )}
    </div>
  );
}

/**
 * UX-07 — bug relatado ao vivo por um médico do piloto: esta tela sempre
 * renderizava os 3 botões Sim/Não/Não sei para QUALQUER pergunta crítica
 * (blocker/important), ignorando `expectedAnswerType` por completo. Quando
 * o modelo perguntava algo como "quais são os valores de PA, FC, FR,
 * SpO2..." (um pedido de texto/números), o médico não tinha como
 * responder — só via Sim/Não/Não sei, nenhum dos quais transmite a
 * informação pedida. Como a informação nunca chegava, o turno seguinte
 * pedia a mesma coisa de novo — o "loop" percebido. Esta função central
 * substitui os dois blocos hardcoded (crítico e opcional) e escolhe o
 * controle certo pelo tipo real da pergunta. Ver também o guard-rail
 * correspondente em output-validator.ts (ANSWER TYPE MISMATCH), que reduz
 * a chance do modelo mandar o tipo errado antes mesmo de chegar aqui.
 */
function AnswerControl({
  question,
  value,
  onChange,
  variant,
  messages,
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  variant: 'critical' | 'optional';
  messages: Messages;
}) {
  const unselectedClass =
    variant === 'critical'
      ? 'border-clinical-amber/50 bg-transparent text-clinical-amber-foreground hover:bg-clinical-amber/5'
      : 'border-clinical-line bg-transparent text-clinical-ink hover:bg-muted';
  const selectedClass =
    variant === 'critical'
      ? 'border-clinical-amber bg-clinical-amber/10 text-clinical-amber-foreground'
      : 'border-clinical-teal bg-clinical-teal-tint text-clinical-teal-deep';
  const inputClass =
    variant === 'critical'
      ? 'w-full rounded-lg border border-clinical-amber/40 bg-white px-3 py-2 text-sm text-clinical-ink outline-none transition-colors placeholder:text-clinical-amber-foreground/50 focus-visible:border-clinical-amber'
      : 'w-full rounded-lg border border-clinical-line bg-paper px-3 py-2 text-sm text-clinical-ink outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-clinical-teal';

  switch (question.expectedAnswerType) {
    case 'boolean':
      return (
        <div className="grid grid-cols-3 gap-2">
          <BooleanButton
            active={value === true}
            activeClass={variant === 'critical' ? 'bg-clinical-ink text-white border-clinical-ink' : selectedClass}
            unselectedClass={unselectedClass}
            onClick={() => onChange(true)}
          >
            {messages.copilot.questions.boolean.yes}
          </BooleanButton>
          <BooleanButton
            active={value === false}
            activeClass={selectedClass}
            unselectedClass={unselectedClass}
            onClick={() => onChange(false)}
          >
            {messages.copilot.questions.boolean.no}
          </BooleanButton>
          <BooleanButton
            active={value === 'unknown'}
            activeClass={selectedClass}
            unselectedClass={unselectedClass}
            onClick={() => onChange('unknown')}
          >
            {messages.copilot.questions.boolean.unknown}
          </BooleanButton>
        </div>
      );
    case 'choice':
      return (
        <div className="flex flex-wrap gap-2">
          {(question.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
              aria-pressed={value === choice}
              className={[
                'h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
                value === choice ? selectedClass : unselectedClass,
              ].join(' ')}
            >
              {choice}
            </button>
          ))}
        </div>
      );
    case 'number':
      return (
        <input
          type="number"
          inputMode="numeric"
          aria-label={question.question}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputClass}
        />
      );
    case 'text':
    default:
      // Textarea (não input de uma linha) — perguntas de texto livre
      // costumam pedir múltiplos valores juntos (ex.: "PA 90x60, FC 130,
      // FR 28, SpO2 89%, Tax 39"), que ficam apertados demais numa linha
      // só, especialmente no celular à beira do leito.
      return (
        <textarea
          aria-label={question.question}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={`${inputClass} min-h-[44px] resize-y`}
        />
      );
  }
}

function BooleanButton({
  active,
  activeClass,
  unselectedClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  unselectedClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'h-9 rounded-lg border text-sm font-medium transition-colors',
        active ? activeClass : unselectedClass,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
