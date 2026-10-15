'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, PencilSimple } from '@phosphor-icons/react';
import type { NumericFieldError } from '@clinical-tools/ranges';
import { stripSourceTags } from '@clinical-tools/cad-ehh/sources';
import type { ResultTone } from '@clinical-tools/tone';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { cn } from '@/lib/utils';

/**
 * Peças da tela do roteiro de CAD e EHH (CC-326). Só desenham: o conteúdo, as
 * faixas e as contas vêm do motor (`@clinical-tools/cad-ehh`).
 */

/** Parágrafos de conteúdo, sem a marca de fonte ([ADA], [UTD]…), como no ANY. */
export function Paragraphs({ texts, className }: { texts: readonly string[]; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {texts.map((text) => (
        <p key={text} className="text-[0.9375rem] text-pretty text-foreground">
          {stripSourceTags(text)}
        </p>
      ))}
    </div>
  );
}

export function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] text-foreground">
      {items.map((item) => (
        <li key={item} className="text-pretty">
          {stripSourceTags(item)}
        </li>
      ))}
    </ul>
  );
}

/** Título de bloco dentro de uma tela ("Fase B — manutenção pelo sódio corrigido"). */
export function BlockTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-base font-semibold text-foreground">
      {children}
    </h3>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] text-pretty text-muted-foreground">{children}</p>;
}

/** Bloco com título e conteúdo, separado do anterior. */
export function Block({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      {title ? <BlockTitle>{title}</BlockTitle> : null}
      {children}
    </section>
  );
}

/**
 * Alerta no tom do motor: crítico vermelho, atenção laranja, neutro cinza
 * (ADR-017). O título leva o significado; o tom só reforça.
 */
export function ToneCallout({
  tone,
  title,
  children,
  icon,
}: {
  tone: ResultTone;
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Callout tone={RESULT_TONE[tone]} title={title} icon={icon}>
      {children}
    </Callout>
  );
}

/**
 * Escolha de uma opção por botões (trilha, apresentação do KCl, via): botões
 * com `aria-pressed`, alvo de 44 px. Tocar de novo na marcada pode desmarcar
 * (quem decide é o reducer).
 */
export function ChoiceButtons<Id extends string | number>({
  label,
  options,
  value,
  onChoose,
  columns,
}: {
  label: string;
  options: readonly { id: Id; label: ReactNode }[];
  value: Id | null;
  onChoose: (id: Id) => void;
  columns?: 1 | 2 | 3 | 5;
}) {
  const grid =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-2'
        : columns === 5
          ? 'grid-cols-5'
          : 'grid-cols-3';
  return (
    <div role="group" aria-label={label} className={cn('grid gap-1.5', grid)}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(option.id)}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-center text-sm transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
              columns === 1 && 'justify-start text-left',
              active
                ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                : 'border-border bg-background text-foreground hover:bg-hover',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Caixa de marcar nativa (risco de hipoglicemia, idoso, precipitante), alvo de 44 px. */
export function CheckItem({
  label,
  description,
  checked,
  onToggle,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
        checked
          ? 'border-primary bg-tone-blue-bg text-tone-blue-ink'
          : 'border-border bg-background text-foreground hover:bg-hover',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn(checked && 'font-medium')}>{label}</span>
        {description ? <span className="text-xs text-pretty opacity-90">{description}</span> : null}
      </span>
    </label>
  );
}

/** Tabela simples de consulta (critérios, exames, cadência), rolável no celular. */
export function SimpleTable({
  head,
  rows,
  activeRow,
  caption,
}: {
  head?: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  /** Linha em destaque (a faixa do potássio, a gravidade). */
  activeRow?: number | null;
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {head ? (
          <thead className="bg-surface-subtle text-left text-xs text-muted-foreground">
            <tr>
              {head.map((cell, index) => (
                <th key={`${cell}-${index}`} scope="col" className="px-3 py-2 font-medium">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => {
            const active = rowIndex === activeRow;
            return (
              <tr
                key={rowIndex}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'border-t border-border align-top first:border-t-0',
                  active && 'bg-tone-blue-bg font-medium text-tone-blue-ink',
                )}
              >
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 text-pretty">
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Número em destaque com a unidade ao lado ("7,0 U/h"). */
export function BigValue({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-subtle px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-foreground tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

/** Campo numérico ligado ao texto cru do estado, com a faixa do motor. */
export function LabInput({
  label,
  unit,
  range,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  unit: string;
  range: { min: number; max: number };
  value: string;
  onChange: (raw: string) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <NumericField
      label={label}
      unit={unit}
      range={range}
      value={value}
      onValueChange={onChange}
      hint={hint}
      placeholder={placeholder}
    />
  );
}

export type FieldErrors<Id extends string> = Readonly<Partial<Record<Id, NumericFieldError>>>;

/** Dados já informados ("70 kg · Glic 450 · K 4,2"), com atalho para editar. */
export function ContextBar({ summary, onEdit }: { summary: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2 text-left transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <span className="text-[0.8125rem] text-muted-foreground tabular-nums">{summary}</span>
      <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium text-link">
        <PencilSimple aria-hidden="true" className="size-3.5" />
        Editar exames
      </span>
    </button>
  );
}

/** Voltar / próximo no fim de cada tela. */
export function StepNav({
  back,
  next,
}: {
  back?: { label: string; onClick: () => void };
  next?: { label: string; onClick: () => void };
}) {
  return (
    <nav aria-label="Navegação do roteiro" className="flex gap-2 border-t border-border pt-4">
      {back ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 flex-1"
          onClick={back.onClick}
        >
          <ArrowLeft aria-hidden="true" />
          {back.label}
        </Button>
      ) : null}
      {next ? (
        <Button type="button" size="lg" className="h-11 flex-1" onClick={next.onClick}>
          {next.label}
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </nav>
  );
}
