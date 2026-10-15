"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Check } from "@phosphor-icons/react";
import { BlockerQuestionCard } from "@/components/domain/blocker-question-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMessages } from "@/lib/messages/use-messages";
import {
  parseAnswerNumber,
  parseVitals,
  type ConversationQuestion,
  type VitalsInput,
} from "@/lib/case-conversation";
import type { VitalsAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * ADR-014 — a pergunta da vez. Uma ideia, um toque: opções prontas (as
 * teclas 1 a 9 escolhem no computador), número com teclado numérico e os
 * sinais vitais que faltam numa tela só. Texto livre e voz vão pelo campo
 * de baixo da conversa.
 */

export type QuestionAnswer =
  | { kind: "choice"; value: string }
  | { kind: "number"; value: number; label: string }
  | { kind: "vitals"; value: VitalsAnswer; label: string }
  | { kind: "unknown"; value: string };

interface QuestionCardProps {
  question: ConversationQuestion;
  onAnswer: (answer: QuestionAnswer) => void;
  /** Enviando uma resposta: trava as opções e marca a escolhida. */
  pendingLabel?: string | null;
  disabled?: boolean;
}

export function QuestionCard({ question, onAnswer, pendingLabel, disabled }: QuestionCardProps) {
  const messages = useMessages();
  const locked = disabled || Boolean(pendingLabel);

  return (
    <BlockerQuestionCard
      question={question.question}
      why={question.why}
      separates={
        question.separates.length > 0
          ? messages.copilot.questions.separates(question.separates)
          : undefined
      }
    >
      {question.answerType === "choice" && (
        <ChoiceAnswer
          question={question}
          locked={locked}
          pendingLabel={pendingLabel}
          onAnswer={onAnswer}
        />
      )}
      {question.answerType === "number" && (
        <NumberAnswer question={question} locked={locked} onAnswer={onAnswer} />
      )}
      {question.answerType === "vitals" && (
        <VitalsAnswerForm question={question} locked={locked} onAnswer={onAnswer} />
      )}
      {question.answerType === "text" && (
        <p className="text-[0.8125rem] font-medium">{messages.conversation.composer.answerPlaceholder}</p>
      )}
    </BlockerQuestionCard>
  );
}

const MAX_SHORTCUT = 9;

/** Atalho só vale com a conversa em primeiro plano: nada de janela ou painel aberto por cima. */
function shortcutBlocked(event: KeyboardEvent): boolean {
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  const overlayOpen = document.querySelector('[aria-modal="true"], [role="dialog"]') !== null;
  return (
    typing ||
    overlayOpen ||
    event.repeat ||
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  );
}

function ChoiceAnswer({
  question,
  locked,
  pendingLabel,
  onAnswer,
}: {
  question: ConversationQuestion;
  locked: boolean;
  pendingLabel?: string | null;
  onAnswer: (answer: QuestionAnswer) => void;
}) {
  // Teclas 1–9 escolhem a opção quando o foco não está num campo de texto.
  useEffect(() => {
    if (locked) return;
    function onKeyDown(event: KeyboardEvent) {
      if (shortcutBlocked(event)) return;
      const position = Number(event.key);
      if (!Number.isInteger(position) || position < 1 || position > MAX_SHORTCUT) return;
      const choice = question.choices[position - 1];
      if (!choice) return;
      event.preventDefault();
      onAnswer({ kind: "choice", value: choice });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, question.choices, onAnswer]);

  return (
    <div role="group" aria-label={question.question} className="flex flex-wrap gap-2">
      {question.choices.map((choice, index) => (
        <OptionButton
          key={choice}
          active={pendingLabel === choice}
          disabled={locked}
          shortcut={index < MAX_SHORTCUT ? index + 1 : undefined}
          onClick={() => onAnswer({ kind: "choice", value: choice })}
        >
          {choice}
        </OptionButton>
      ))}
    </div>
  );
}

function NumberAnswer({
  question,
  locked,
  onAnswer,
}: {
  question: ConversationQuestion;
  locked: boolean;
  onAnswer: (answer: QuestionAnswer) => void;
}) {
  const messages = useMessages();
  const copy = messages.conversation;
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const value = parseAnswerNumber(raw);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value === null || locked) return;
    const label = question.unit ? `${raw.trim()} ${question.unit}` : raw.trim();
    onAnswer({ kind: "number", value, label });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className="sr-only">
        {question.question}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          placeholder={copy.numberPlaceholder}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          disabled={locked}
          className="w-28 border-tone-orange/35 bg-background text-foreground"
        />
        {question.unit && <span className="text-sm">{question.unit}</span>}
      </div>
      <Button type="submit" size="sm" disabled={locked || value === null} className="max-sm:h-10">
        {copy.numberSend}
      </Button>
      <OptionButton
        active={false}
        disabled={locked}
        onClick={() => onAnswer({ kind: "unknown", value: copy.numberUnknown })}
      >
        {copy.numberUnknown}
      </OptionButton>
    </form>
  );
}

function VitalsAnswerForm({
  question,
  locked,
  onAnswer,
}: {
  question: ConversationQuestion;
  locked: boolean;
  onAnswer: (answer: QuestionAnswer) => void;
}) {
  const messages = useMessages();
  const copy = messages.conversation.vitals;
  const formId = useId();
  const [input, setInput] = useState<VitalsInput>({});
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const parsed = parseVitals(input);
    if (parsed.kind !== "valid") {
      setInvalid(parsed.kind === "invalid");
      return;
    }
    const label = question.vitalSigns
      .filter((sign) => input[sign]?.trim())
      .map((sign) => `${copy.labels[sign]} ${input[sign]?.trim()} ${copy.units[sign]}`)
      .join(" · ");
    onAnswer({ kind: "vitals", value: parsed.vitals, label });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-describedby={invalid ? `${formId}-error` : undefined}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {question.vitalSigns.map((sign) => (
          <label key={sign} className="flex flex-col gap-1 text-[0.8125rem]">
            <span>
              {copy.labels[sign]} <span className="opacity-75">({copy.units[sign]})</span>
            </span>
            <Input
              inputMode={sign === "bloodPressure" ? "text" : "decimal"}
              autoComplete="off"
              placeholder={sign === "bloodPressure" ? copy.bloodPressurePlaceholder : undefined}
              value={input[sign] ?? ""}
              onChange={(event) => {
                setInvalid(false);
                setInput((current) => ({ ...current, [sign]: event.target.value }));
              }}
              disabled={locked}
              className="border-tone-orange/35 bg-background text-foreground"
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p id={`${formId}-error`} role="alert" className="text-[0.8125rem] font-medium">
          {copy.invalid}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={locked} className="max-sm:h-10">
          {copy.send}
        </Button>
        <OptionButton
          active={false}
          disabled={locked}
          onClick={() => onAnswer({ kind: "unknown", value: copy.none })}
        >
          {copy.none}
        </OptionButton>
      </div>
    </form>
  );
}

/**
 * Opção de resposta. Escolhida: preenchimento escuro neutro + ✓ — o estado
 * não depende da cor do bloco laranja em volta.
 */
function OptionButton({
  active,
  disabled,
  shortcut,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  shortcut?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-default max-sm:h-10",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-tone-orange/35 bg-background text-foreground hover:bg-hover disabled:opacity-60",
      )}
    >
      {active && <Check className="size-3.5" weight="bold" aria-hidden="true" />}
      {children}
    </button>
  );
}
