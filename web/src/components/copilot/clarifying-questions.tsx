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

export function ClarifyingQuestions({
  questions,
  answers,
  onAnswerChange,
  disabled,
}: ClarifyingQuestionsProps) {
  if (questions.length === 0) return null;

  const sorted = [...questions].sort(
    (a, b) => CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{messages.copilot.questions.heading}</h2>
      <div className="space-y-3">
        {sorted.map((question) => (
          <ClarifyingQuestionCard
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => onAnswerChange(question.id, value)}
            disabled={disabled}
          />
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
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
}) {
  if (question.criticality === "blocker") {
    return (
      <BlockerQuestionCard question={question.question} why={question.why}>
        <AnswerInput question={question} value={value} onChange={onChange} disabled={disabled} size="lg" />
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
        <AnswerInput question={question} value={value} onChange={onChange} disabled={disabled} />
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
}: {
  question: ClarifyingQuestion;
  value: ClarifyingAnswerValue | undefined;
  onChange: (value: ClarifyingAnswerValue) => void;
  disabled?: boolean;
  size?: "default" | "lg";
}) {
  const buttonSizeClass = size === "lg" ? "h-11 px-4" : undefined;

  switch (question.expectedAnswerType) {
    case "boolean":
      return (
        <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
          {BOOLEAN_OPTIONS.map((option) => (
            <Button
              key={option.label}
              type="button"
              variant={value === option.value ? "default" : "outline"}
              aria-pressed={value === option.value}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={buttonSizeClass}
            >
              {option.label}
            </Button>
          ))}
        </div>
      );
    case "choice":
      return (
        <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
          {(question.choices ?? []).map((choice) => (
            <Button
              key={choice}
              type="button"
              variant={value === choice ? "default" : "outline"}
              aria-pressed={value === choice}
              disabled={disabled}
              onClick={() => onChange(choice)}
              className={buttonSizeClass}
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
        />
      );
  }
}
