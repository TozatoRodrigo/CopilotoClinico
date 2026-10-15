'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Título de bloco dentro de um passo ("Pressão de pulso (PP)"). */
export function BlockTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-base font-semibold text-foreground">
      {children}
    </h3>
  );
}

/** Texto de apoio de um bloco (técnica, fonte). */
export function BlockHint({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] text-pretty text-muted-foreground">{children}</p>;
}

/** Dados já informados em passos anteriores ("TEC 5,5 s"), como os selos do ANY. */
export function DataChips({
  items,
  label = 'Dados do roteiro',
}: {
  items: readonly { label: string; value: string | null }[];
  label?: string;
}) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.label}>
          <Badge variant="gray" className="h-6 gap-1.5 px-2 text-[0.8125rem]">
            <span>{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value ?? '--'}</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Caixa de marcar (critério, achado do eco): nativa, alvo de 44 px, foco visível. */
export function CheckItem({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
        checked
          ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
          : 'border-border bg-background text-foreground hover:bg-hover',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}

/**
 * Pergunta respondida com um toque que já leva a algum lugar ("TEC
 * normalizou?"): dois botões de ação, não um rádio, porque a resposta move o
 * roteiro (como no ANY).
 */
export function ActionQuestion({
  id,
  question,
  answers,
}: {
  id: string;
  question: string;
  answers: readonly { label: string; onSelect: () => void }[];
}) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <p id={id} className="text-sm font-medium text-foreground">
        {question}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {answers.map((answer) => (
          <Button key={answer.label} type="button" variant="outline" onClick={answer.onSelect}>
            {answer.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Voltar / próximo no fim de cada passo. */
export function StepNav({
  back,
  next,
}: {
  back?: { label: string; onClick: () => void };
  next?: { label: string; onClick: () => void; icon?: ReactNode; variant?: 'default' | 'outline' };
}) {
  return (
    <nav aria-label="Passos do roteiro" className="flex gap-2 border-t border-border pt-4">
      {back ? (
        <Button type="button" variant="outline" className="flex-1" onClick={back.onClick}>
          <ArrowLeft aria-hidden="true" />
          {back.label}
        </Button>
      ) : null}
      {next ? (
        <Button
          type="button"
          variant={next.variant ?? 'default'}
          className="flex-1"
          onClick={next.onClick}
        >
          {next.label}
          {next.icon ?? <ArrowRight aria-hidden="true" />}
        </Button>
      ) : null}
    </nav>
  );
}
