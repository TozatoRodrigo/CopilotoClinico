import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockerQuestionCard } from "@/components/domain/blocker-question-card";
import { messages } from "@/lib/messages";
import type { ClarifyingAnswerValue, ClarifyingQuestion } from "@/lib/types";

const CRITICALITY_ORDER: Record<ClarifyingQuestion["criticality"], number> = {
  blocker: 0,
  important: 1,
  optional: 2,
};

const BOOLEAN_OPTIONS: { label: string; value: ClarifyingAnswerValue }[] = [
  { label: messages.copilot.questions.boolean.yes, value: true },
  { label: messages.copilot.questions.boolean.no, value: false },
  { label: messages.copilot.questions.boolean.unknown, value: "unknown" },
];

interface ClarifyingQuestionsProps {
  questions: ClarifyingQuestion[];
  answers: Record<string, ClarifyingAnswerValue>;
  onAnswerChange: (questionId: string, value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
}

interface QuestionGroup {
  /** null = grupo "sem finalidade" — só existe no modo degradado (ver agrupar()). */
  purpose: string | null;
  questions: ClarifyingQuestion[];
}

/**
 * UX-01 — Agrupa por `purpose` (finalidade clínica) preservando a ordem de
 * criticidade: cada grupo aparece na posição do seu membro mais crítico, e
 * a ordem interna de cada grupo também respeita blocker → important →
 * optional. Degrada graciosamente para lista simples (sem cabeçalhos de
 * grupo) quando QUALQUER pergunta do turno não tem `purpose` — misturar
 * perguntas agrupadas com soltas ficaria inconsistente, então a regra é
 * tudo-ou-nada por turno, não por pergunta.
 */
function groupByPurpose(questions: ClarifyingQuestion[]): QuestionGroup[] {
  const sorted = [...questions].sort(
    (a, b) => CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality],
  );

  const allHavePurpose = sorted.every((q) => Boolean(q.purpose?.trim()));
  if (!allHavePurpose) {
    return [{ purpose: null, questions: sorted }];
  }

  const order: string[] = [];
  const byPurpose = new Map<string, ClarifyingQuestion[]>();
  for (const question of sorted) {
    const purpose = question.purpose!.trim();
    if (!byPurpose.has(purpose)) {
      byPurpose.set(purpose, []);
      order.push(purpose);
    }
    byPurpose.get(purpose)!.push(question);
  }

  return order.map((purpose) => ({ purpose, questions: byPurpose.get(purpose)! }));
}

export function ClarifyingQuestions({
  questions,
  answers,
  onAnswerChange,
  disabled,
}: ClarifyingQuestionsProps) {
  if (questions.length === 0) return null;

  const groups = groupByPurpose(questions);
  // UX-01 — derivado puramente de `groups` (não uma flag mutável durante o
  // render, que o React Compiler rejeita com razão: quebraria sob
  // StrictMode/renders concorrentes). "Primeiro" é sempre a primeira
  // pergunta do primeiro grupo, na ordem já resolvida por groupByPurpose().
  const firstQuestionId = groups[0]?.questions[0]?.id;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{messages.copilot.questions.heading}</h2>
      <div className="space-y-4">
        {groups.map((group) => (
          <Fragment key={group.purpose ?? "__ungrouped__"}>
            {group.purpose && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.purpose}
              </h3>
            )}
            <div className="space-y-3">
              {group.questions.map((question) => (
                <ClarifyingQuestionCard
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => onAnswerChange(question.id, value)}
                  disabled={disabled}
                  // UX-01 — foco automático só na primeira pergunta do
                  // turno inteiro (não uma por grupo), para o médico já
                  // poder responder digitando/tocando sem precisar tocar
                  // no campo antes.
                  autoFocus={question.id === firstQuestionId}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ClarifyingQuestionCard({
  question,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  if (question.criticality === "blocker") {
    return (
      <BlockerQuestionCard question={question.question} why={question.why}>
        <AnswerInput
          question={question}
          value={value}
          onChange={onChange}
          disabled={disabled}
          size="lg"
          autoFocus={autoFocus}
        />
      </BlockerQuestionCard>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{question.question}</CardTitle>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">{messages.copilot.questions.whyAsk}</summary>
          <p className="mt-1">{question.why}</p>
        </details>
      </CardHeader>
      <CardContent>
        <AnswerInput
          question={question}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      </CardContent>
    </Card>
  );
}

function AnswerInput({
  question,
  value,
  onChange,
  disabled,
  size = "default",
  autoFocus,
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
  size?: "default" | "lg";
  autoFocus?: boolean;
}) {
  const buttonSizeClass = size === "lg" ? "h-11 px-4" : undefined;

  switch (question.expectedAnswerType) {
    case "boolean":
      return (
        <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
          {BOOLEAN_OPTIONS.map((option, index) => (
            <Button
              key={option.label}
              type="button"
              variant={value === option.value ? "default" : "outline"}
              aria-pressed={value === option.value}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={buttonSizeClass}
              autoFocus={autoFocus && index === 0}
            >
              {option.label}
            </Button>
          ))}
        </div>
      );
    case "choice":
      return (
        <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
          {(question.choices ?? []).map((choice, index) => (
            <Button
              key={choice}
              type="button"
              variant={value === choice ? "default" : "outline"}
              aria-pressed={value === choice}
              disabled={disabled}
              onClick={() => onChange(choice)}
              className={buttonSizeClass}
              autoFocus={autoFocus && index === 0}
            >
              {choice}
            </Button>
          ))}
        </div>
      );
    case "number":
      return (
        <Input
          type="number"
          inputMode="numeric"
          aria-label={question.question}
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          autoFocus={autoFocus}
        />
      );
    case "text":
    default:
      return (
        <Input
          type="text"
          aria-label={question.question}
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
      );
  }
}
