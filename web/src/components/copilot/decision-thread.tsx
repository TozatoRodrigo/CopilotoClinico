'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { BlockerQuestionCard } from '@/components/domain/blocker-question-card';
import { RecommendationCard } from '@/components/copilot/recommendation-card';
import { UncertaintyBanner } from '@/components/domain/uncertainty-banner';
import { useCopilotConversation, type StoredCopilotResult } from '@/hooks/use-copilot-conversation';
import { useRecommendationDecisions } from '@/hooks/use-recommendation-decisions';
import type { ClarifyingAnswerValue, ClarifyingQuestion, CopilotRecommendation, EvidenceFigure, EvidenceTable, RedFlag } from '@/lib/types';
import { useMessages } from '@/lib/messages/use-messages';
import type { Messages } from '@/lib/messages';
import { Circle, CheckCircle, ArrowClockwise, WifiSlash, Warning, Siren } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface DecisionThreadProps {
  encounterId: string;
  initial: StoredCopilotResult;
}

const CRITICALITY_ORDER: Record<ClarifyingQuestion['criticality'], number> = {
  blocker: 0,
  important: 1,
  optional: 2,
};

const CATEGORY_ORDER: Record<string, number> = {
  stabilization: 0,
  diagnostic: 1,
  therapeutic: 2,
  verify: 3,
};

export function DecisionThread({ encounterId, initial }: DecisionThreadProps) {
  const messages = useMessages();
  const {
    analysis,
    turns,
    answers,
    setAnswer,
    reanalyze,
    reanalyzing,
    respondError,
    queued,
    canReanalyze,
  } = useCopilotConversation(encounterId, initial);

  const hasBlockers = analysis.clarifyingQuestions.some((q) => q.criticality === 'blocker');
  const allBlockersAnswered = analysis.clarifyingQuestions
    .filter((q) => q.criticality === 'blocker')
    .every((q) => answers[q.id] !== undefined);

  const sortedQuestions = [...analysis.clarifyingQuestions].sort(
    (a, b) => CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality],
  );

  const sortedRecommendations = [...analysis.recommendations].sort((a, b) => {
    const catDiff =
      (CATEGORY_ORDER[a.category ?? 'therapeutic'] ?? 2) -
      (CATEGORY_ORDER[b.category ?? 'therapeutic'] ?? 2);
    if (catDiff !== 0) return catDiff;
    return b.confidence - a.confidence;
  });

  const preliminaryRecs = sortedRecommendations.filter((r) => r.preliminary);
  const definitiveRecs = sortedRecommendations.filter((r) => !r.preliminary);

  // S23-CLIN-06 — decisões por recomendação (adotar/rejeitar/anotar).
  // Persistidas localmente em sessionStorage para sobreviver refresh e
  // navegação entre Capture/Resultado. Não vai ao backend nesta versão.
  const {
    decisions,
    setDecision,
    setNote,
    counts: decisionsCounts,
  } = useRecommendationDecisions(encounterId, analysis.recommendations.length);

  const handleAdopt = (recId: string) => setDecision(recId, 'adopted');
  const handleReject = (recId: string) => setDecision(recId, 'rejected');
  const handleNote = (recId: string, note: string) => setNote(recId, note);

  return (
    <div className="space-y-0">
      <div className="relative pl-8">
        <div className="absolute top-0 bottom-0 left-[11px] w-px bg-clinical-line" />

        {analysis.redFlags?.length > 0 && (
          <ThreadNode icon="pending" accent="amber">
            <RedFlagsBlock redFlags={analysis.redFlags} messages={messages} />
          </ThreadNode>
        )}

        {analysis.uncertainty && (
          <ThreadNode>
            <UncertaintyBanner reason={analysis.uncertaintyReason} />
          </ThreadNode>
        )}

        {sortedQuestions.length > 0 && (
          <ThreadNode icon={hasBlockers && !allBlockersAnswered ? 'pending' : 'done'}>
            <div className="space-y-3">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {messages.copilot.questions.heading}
              </h2>
              {sortedQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => setAnswer(question.id, value)}
                  disabled={reanalyzing}
                  messages={messages}
                />
              ))}

              {respondError && (
                <Alert variant="destructive" className="mt-3">
                  <AlertTitle>{messages.copilot.reanalyze.errorTitle}</AlertTitle>
                  <AlertDescription>{respondError}</AlertDescription>
                </Alert>
              )}

              {queued && (
                <Alert className="mt-3 border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground">
                  <WifiSlash className="size-4 text-clinical-amber" />
                  <AlertTitle>{messages.copilot.queued.title}</AlertTitle>
                  <AlertDescription>
                    {messages.copilot.queued.description}
                  </AlertDescription>
                </Alert>
              )}

              {/*
                S23-CLIN-07 — quando colapsado (max-h-0 opacity-0), o container
                também aplica aria-hidden e o botão interno recebe
                tabIndex={-1} para sair da ordem de tab.
              */}
              {analysis.clarifyingQuestions.length > 0 && (
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-300 ease-out',
                    allBlockersAnswered ? 'mt-3 max-h-16 opacity-100' : 'max-h-0 opacity-0',
                  )}
                  aria-hidden={allBlockersAnswered ? undefined : true}
                >
                  <Button
                    onClick={reanalyze}
                    disabled={!canReanalyze}
                    tabIndex={allBlockersAnswered ? undefined : -1}
                    className="h-11"
                  >
                    <ArrowClockwise className="mr-2 size-4" />
                    {reanalyzing ? messages.copilot.reanalyze.loading : messages.copilot.reanalyze.cta}
                  </Button>
                </div>
              )}
            </div>
          </ThreadNode>
        )}

        {preliminaryRecs.length > 0 && (
          <ThreadNode icon="pending">
            <div className="space-y-3">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {messages.copilot.sections.preliminary}
              </h2>
              {preliminaryRecs.map((rec, i) => (
                <div key={i} className="opacity-55">
                  <RecommendationCard rec={rec} />
                </div>
              ))}
            </div>
          </ThreadNode>
        )}

        {definitiveRecs.length > 0 && (
          <ThreadNode icon="done" accent="green">
            <div className="space-y-3">
              {/*
                S23-CLIN-06 — sumário de decisões no header da seção de conduta.
                Ajuda o médico a ver progresso (X adotadas / Y rejeitadas / Z pendentes)
                antes de finalizar o caso.
              */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {messages.copilot.sections.conduta}
                </h2>
                {decisionsCounts && (decisionsCounts.adopted > 0 || decisionsCounts.rejected > 0) && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {decisionsCounts.adopted} adotada{decisionsCounts.adopted !== 1 ? 's' : ''}
                    {' · '}
                    {decisionsCounts.rejected} rejeitada{decisionsCounts.rejected !== 1 ? 's' : ''}
                    {' · '}
                    {decisionsCounts.pending} pendente{decisionsCounts.pending !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              {definitiveRecs.map((rec, i) => {
                // ID estável alinhado com o usado no card (citationChunkId ou slice do action).
                const recId = rec.citationChunkId ?? rec.action.slice(0, 32);
                return (
                  <RecommendationCard
                    key={i}
                    rec={rec}
                    decision={decisions[recId]}
                    onAdopt={handleAdopt}
                    onReject={handleReject}
                    onNote={handleNote}
                  />
                );
              })}
            </div>
          </ThreadNode>
        )}

        {analysis.differentials.length > 0 && (
          <ThreadNode icon="note">
            <div className="space-y-3">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {messages.copilot.differentials.heading}
              </h2>
              {analysis.differentials.map((d, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-clinical-line bg-white/60 px-4 py-3"
                >
                  <p className="font-medium text-foreground">{d.hypothesis}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{d.whyConsider}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium text-foreground">{messages.copilot.differentials.whatDistinguishes}</span>{' '}
                    <span className="text-muted-foreground">{d.whatDistinguishes}</span>
                  </p>
                </div>
              ))}
            </div>
          </ThreadNode>
        )}

        {analysis.citations.length > 0 && (
          <ThreadNode icon="cite">
            <CitationsBlock citations={analysis.citations} messages={messages} />
          </ThreadNode>
        )}

        {turns.length > 0 && <CollapsedTurns turns={turns} messages={messages} />}
      </div>
    </div>
  );
}

function ThreadNode({
  icon,
  accent,
  children,
}: {
  icon?: 'pending' | 'done' | 'note' | 'cite' | undefined;
  accent?: 'green' | 'amber';
  children: React.ReactNode;
}) {
  return (
    <div className="relative pb-6">
      <div
        className={cn(
          'absolute -left-8 top-0.5 flex size-6 items-center justify-center rounded-full border-2',
          icon === 'done' && accent === 'green'
            ? 'border-clinical-green bg-clinical-green-bg text-clinical-green'
            : icon === 'done'
              ? 'border-clinical-teal bg-clinical-teal-tint text-clinical-teal'
              : icon === 'pending'
                ? 'border-clinical-amber bg-clinical-amber-bg text-clinical-amber'
                : 'border-clinical-line bg-white text-muted-foreground',
        )}
      >
        {icon === 'done' ? (
          <CheckCircle weight="fill" className="size-3.5" />
        ) : icon === 'pending' ? (
          <Circle weight="fill" className="size-3.5" />
        ) : (
          <Circle className="size-3 text-clinical-line" />
        )}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

function QuestionCard({
  question,
  value,
  onChange,
  disabled,
  messages,
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
  messages: Messages;
}) {
  const isBlocker = question.criticality === 'blocker';

  if (isBlocker) {
    return (
      <BlockerQuestionCard question={question.question} why={question.why}>
        <AnswerInput question={question} value={value} onChange={onChange} disabled={disabled} messages={messages} />
      </BlockerQuestionCard>
    );
  }

  return (
    <div className="rounded-lg border border-clinical-line bg-white/60 px-4 py-3">
      <p className="font-medium text-foreground">{question.question}</p>
      <details className="mt-1 text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">{messages.copilot.questions.whyAsk}</summary>
        <p className="mt-1">{question.why}</p>
      </details>
      <div className="mt-2">
        <AnswerInput question={question} value={value} onChange={onChange} disabled={disabled} messages={messages} />
      </div>
    </div>
  );
}

function booleanOptions(messages: Messages): { label: string; value: ClarifyingAnswerValue }[] {
  return [
    { label: messages.copilot.questions.boolean.yes, value: true },
    { label: messages.copilot.questions.boolean.no, value: false },
    { label: messages.copilot.questions.boolean.unknown, value: 'unknown' },
  ];
}

function AnswerInput({
  question,
  value,
  onChange,
  disabled,
  messages,
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
  messages: Messages;
}) {
  switch (question.expectedAnswerType) {
    case 'boolean':
      return (
        <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
          {booleanOptions(messages).map((option) => (
            <button
              key={option.label}
              type="button"
              disabled={disabled}
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-11 min-w-[5rem] items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-teal',
                'disabled:pointer-events-none disabled:opacity-50',
                value === option.value
                  ? 'border-clinical-teal bg-clinical-teal-tint text-clinical-teal-deep'
                  : 'border-clinical-line bg-white text-foreground hover:bg-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    case 'choice':
      return (
        <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
          {(question.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              aria-pressed={value === choice}
              onClick={() => onChange(choice)}
              className={cn(
                'inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-teal',
                'disabled:pointer-events-none disabled:opacity-50',
                value === choice
                  ? 'border-clinical-teal bg-clinical-teal-tint text-clinical-teal-deep'
                  : 'border-clinical-line bg-white text-foreground hover:bg-muted',
              )}
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
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="h-11 w-full max-w-[12rem] rounded-lg border border-clinical-line bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-teal disabled:opacity-50"
        />
      );
    case 'text':
    default:
      // UX-07 — perguntas de texto livre costumam pedir múltiplos valores
      // juntos (ex.: "PA 90x60, FC 130, FR 28, SpO2 89%, Tax 39") — um
      // <input> de uma linha só fica apertado demais para digitar isso à
      // beira do leito, especialmente no celular. Textarea com
      // field-sizing-content cresce com o conteúdo sem precisar de scroll.
      return (
        <Textarea
          aria-label={question.question}
          value={value === undefined ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="min-h-[44px] w-full resize-y bg-white text-sm focus-visible:ring-clinical-teal disabled:opacity-50"
        />
      );
  }
}

function redFlagSeverityConfig(
  messages: Messages,
): Record<RedFlag['severity'], { label: string; className: string; icon: typeof Siren }> {
  return {
    critical: {
      label: messages.redFlags.severity.critical,
      className: 'border-clinical-error/40 bg-clinical-error-bg text-clinical-error-foreground',
      icon: Siren,
    },
    high: {
      label: messages.redFlags.severity.high,
      className: 'border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground',
      icon: Warning,
    },
    moderate: {
      label: messages.redFlags.severity.moderate,
      className: 'border-clinical-line bg-white/60 text-foreground',
      icon: Warning,
    },
  };
}

const SEVERITY_ORDER: Record<RedFlag['severity'], number> = {
  critical: 0,
  high: 1,
  moderate: 2,
};

function RedFlagsBlock({ redFlags, messages }: { redFlags: RedFlag[]; messages: Messages }) {
  const sorted = [...redFlags].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const severityConfig = redFlagSeverityConfig(messages);

  return (
    <div className="space-y-2">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-clinical-error">
        {messages.redFlags.heading}
      </h2>
      {sorted.map((rf, i) => {
        const config = severityConfig[rf.severity];
        const Icon = config.icon;
        return (
          <div
            key={i}
            className={cn('rounded-lg border px-4 py-3', config.className)}
          >
            <div className="flex items-start gap-2">
              <Icon weight="fill" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{rf.finding}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                    {config.label}
                  </Badge>
                </div>
                <p className="mt-1 text-sm opacity-90">{rf.action}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CitationsBlock({
  citations,
  messages,
}: {
  citations: Array<{
    source: string;
    sourceVersion: string;
    chunkId: string;
    text: string;
    origin?: 'institutional' | 'public';
    evidenceFigure?: EvidenceFigure | null;
    evidenceTable?: EvidenceTable | null;
  }>;
  messages: Messages;
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {messages.copilot.citations.heading}
      </h2>
      {citations.map((c, i) => (
        <div key={i} className="rounded-lg border border-clinical-line bg-white/60 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs font-medium text-foreground">
                {c.source} v{c.sourceVersion}
              </span>
              {c.origin === 'institutional' ? (
                <Badge variant="secondary" className="shrink-0">
                  {messages.copilot.citations.institutionalBadgeShort}
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0">
                  {messages.copilot.citations.publicBadgeShort}
                </Badge>
              )}
            </span>
            <a
              className="shrink-0 font-mono text-xs text-clinical-teal underline underline-offset-4"
              href={`/v1/guidelines/chunks/${c.chunkId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {messages.copilot.citations.viewExcerptShort}
            </a>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.text}</p>
          {c.evidenceFigure && (
            <figure className="mt-2 space-y-1">
              <a href={c.evidenceFigure.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={c.evidenceFigure.url}
                  alt={c.evidenceFigure.caption ?? messages.copilot.citations.figureFallback(c.source)}
                  className="w-full rounded-lg border border-clinical-line"
                  loading="lazy"
                />
              </a>
              {c.evidenceFigure.caption && (
                <figcaption className="text-xs text-muted-foreground">
                  {c.evidenceFigure.caption}
                </figcaption>
              )}
            </figure>
          )}
          {c.evidenceTable && (
            <div className="mt-2 overflow-x-auto">
              {c.evidenceTable.caption && (
                <p className="mb-1 text-xs text-muted-foreground">{c.evidenceTable.caption}</p>
              )}
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {c.evidenceTable.columns.map((col, ci) => (
                      <th
                        key={ci}
                        className="border border-clinical-line bg-muted/30 px-2 py-1 text-left font-medium"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.evidenceTable.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, cci) => (
                        <td key={cci} className="border border-clinical-line px-2 py-1 text-muted-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CollapsedTurns({
  turns,
  messages,
}: {
  turns: Array<{
    turnIndex: number;
    analysis: {
      recommendations: CopilotRecommendation[];
      clarifyingQuestions: Array<{ id: string }>;
    };
  }>;
  messages: Messages;
}) {
  if (turns.length === 0) return null;

  return (
    <div className="space-y-1 pb-6">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {messages.copilot.turns.previous}
      </h2>
      {turns.map((turn) => (
        <details
          key={turn.turnIndex}
          className="group rounded-lg border border-clinical-line bg-white/40"
        >
          <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2 font-mono text-xs text-muted-foreground hover:text-foreground">
            <CheckCircle className="size-3 text-clinical-green" />
            <span>
              {messages.copilot.turns.previousSummary(
                turn.turnIndex + 1,
                turn.analysis.clarifyingQuestions.length,
              )}
            </span>
          </summary>
          <div className="space-y-1 px-4 pb-3">
            {turn.analysis.recommendations.map((rec, i) => (
              <p key={i} className="font-mono text-xs text-muted-foreground">
                {labelForCategory(messages, rec.category)} {rec.action}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function labelForCategory(messages: Messages, category?: string): string {
  const c = messages.recommendation.category;
  switch (category) {
    case 'stabilization':
      return messages.recommendation.categoryBracket(c.stabilization);
    case 'diagnostic':
      return messages.recommendation.categoryBracket(c.diagnostic);
    case 'verify':
      return messages.recommendation.categoryBracket(c.verify);
    default:
      return messages.recommendation.categoryBracket(c.therapeutic);
  }
}
