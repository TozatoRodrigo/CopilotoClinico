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
import { TimelineRail } from '@/components/ui/timeline-rail';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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
} from '@phosphor-icons/react';
import type {
  ClarifyingAnswerValue,
  ClarifyingQuestion,
  CopilotAnalysis,
  DocumentType,
  LatestInteractionResponse,
  RedFlagSeverity,
} from '@/lib/types';

const DOCUMENT_TYPES: { type: DocumentType; label: string; primary?: boolean }[] = [
  { type: 'soap', label: 'SOAP', primary: true },
  { type: 'sbar', label: 'SBAR' },
  { type: 'prescricao', label: 'Prescrição' },
  { type: 'alta', label: 'Alta' },
  { type: 'atestado', label: 'Atestado' },
];

function railFor(category?: string): { label: string; color: 'amber' | 'teal' | 'gray' } {
  if (category === 'stabilization') return { label: 'AGORA', color: 'amber' };
  if (category === 'therapeutic') return { label: 'CONDUTA', color: 'teal' };
  return { label: 'DIAGNÓSTICO', color: 'gray' };
}

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
  const { decisions, setDecision } = useRecommendationDecisions(
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
          <div className="hidden items-center gap-1.5 sm:flex">
            {analysis.redFlags.map((flag, i) => (
              <RedFlagBadge
                key={`${flag.finding}-${i}`}
                finding={flag.finding}
                severity={flag.severity}
              />
            ))}
          </div>
        </div>
        <ProgressSteps steps={['Captura', 'Análise', 'Documento']} currentStep={1} />
      </header>

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
              <div
                key={q.id}
                className="rounded-2xl border-[1.5px] p-5"
                style={{
                  borderColor: 'rgba(180,83,9,0.55)',
                  background: 'var(--amber-bg)',
                }}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-[1.03125rem] font-semibold leading-snug text-clinical-amber-foreground">
                    {q.question}
                  </p>
                  <span className="shrink-0 rounded-full bg-clinical-amber px-2 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-white">
                    Muda a conduta
                  </span>
                </div>
                <p className="mb-3 text-[0.8125rem] leading-relaxed text-clinical-amber-foreground/80">
                  {q.why}
                </p>
                <AnswerControl
                  question={q}
                  value={answers[q.id]}
                  onChange={(value) => setAnswer(q.id, value)}
                  variant="critical"
                  messages={messages}
                />
              </div>
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

          {analysis.differentials.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-dashed border-clinical-line pt-5">
              <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {messages.copilot.differentials.heading}
              </p>
              {analysis.differentials.map((d, i) => (
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
            <div className="flex items-start gap-2 rounded-lg border border-clinical-amber/40 bg-clinical-amber-bg px-4 py-3">
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-clinical-amber" weight="bold" />
              <p className="text-[0.8125rem] text-clinical-amber-foreground">
                {analysis.uncertaintyReason ?? messages.uncertainty.defaultReason}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {recommendations.map((rec, index) => {
              const recId = String(index);
              const rail = railFor(rec.category);
              const decision = decisions[recId]?.decision;
              return (
                <div key={recId} className="flex gap-4">
                  <TimelineRail label={rail.label} color={rail.color} />
                  <div
                    className={[
                      'flex-1 rounded-[14px] border bg-card p-5',
                      rec.preliminary
                        ? 'border-dashed border-clinical-line opacity-55'
                        : 'border-clinical-line',
                    ].join(' ')}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <h3 className="text-[0.9375rem] font-semibold leading-snug text-clinical-ink">
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
                        {messages.recommendation.confidence(rec.confidence)}
                      </span>
                      {decision === 'adopted' && (
                        <span className="flex items-center gap-1 rounded-md border border-clinical-green/30 bg-clinical-green-bg px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-clinical-green-foreground">
                          <SealCheck className="size-3" weight="fill" />
                          Adotada
                        </span>
                      )}
                    </div>

                    <p className="mb-3 text-[0.84375rem] leading-relaxed text-muted-foreground">
                      {rec.rationale}
                    </p>

                    <p className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                      <span className="font-mono font-semibold text-clinical-teal">
                        [{index + 1}]
                      </span>
                      <span className="truncate">{rec.source}</span>
                    </p>

                    {decision !== 'adopted' && (
                      <div className="mt-4 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => setDecision(recId, 'adopted')}
                          className="bg-clinical-ink text-white hover:bg-clinical-ink/90"
                        >
                          Adotar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDecision(recId, 'rejected')}
                        >
                          Rejeitar
                        </Button>
                        <Button size="sm" variant="outline">
                          <PencilSimple className="size-3.5" />
                          Anotar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
