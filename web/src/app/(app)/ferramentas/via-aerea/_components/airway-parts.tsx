'use client';

import { useId, type ReactNode } from 'react';
import { Info, Warning, WarningOctagon } from '@phosphor-icons/react';
import type { AirwayNotice, AirwayNoticeTone } from '@clinical-tools/airway/content';
import { Callout } from '@/components/ui/callout';
import { toneTag, type Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';

/**
 * Peças da tela da via aérea. Todo texto clínico vem do motor
 * (`@clinical-tools/airway`); aqui só há desenho e estado de formulário.
 */

/** Tom do aviso no design system: informação azul; os demais pelo ADR-017. */
export const NOTICE_TONE: Record<AirwayNoticeTone, Tone> = { info: 'blue', ...RESULT_TONE };

const NOTICE_ICON: Record<AirwayNoticeTone, ReactNode> = {
  info: <Info />,
  neutral: <Info />,
  attention: <Warning />,
  critical: <WarningOctagon />,
};

/** Aviso do roteiro (callout com ícone + texto: estado nunca só por cor). */
export function NoticeCallout({
  notice,
  action,
  className,
}: {
  notice: AirwayNotice;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Callout
      tone={NOTICE_TONE[notice.tone]}
      icon={NOTICE_ICON[notice.tone]}
      title={notice.title}
      action={action}
      className={className}
    >
      {notice.lines.length === 1 ? (
        notice.lines[0]
      ) : (
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          {notice.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </Callout>
  );
}

/** Bloco com título (seção do passo). Estrutura por espaço e tipografia, sem cartão colorido. */
export function Block({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="text-base font-semibold text-foreground">
          {title}
        </h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export interface CheckRowProps {
  title: ReactNode;
  detail?: ReactNode;
  checked: boolean;
  onToggle: () => void;
  /** Conteúdo extra quando marcado (ex.: sugestões do CRASH). */
  children?: ReactNode;
}

/**
 * Item marcável: checkbox nativo dentro do rótulo (alvo de toque de 44px,
 * espaço marca, leitor de tela anuncia o estado). Marcado fica no tom de
 * seleção (azul), como as opções das calculadoras.
 */
export function CheckRow({ title, detail, checked, onToggle, children }: CheckRowProps) {
  return (
    <li className="flex flex-col gap-1.5">
      <label
        className={cn(
          'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
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
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {detail ? (
            <span
              className={cn(
                'mt-0.5 block text-xs',
                checked ? 'text-tone-blue-ink' : 'text-muted-foreground',
              )}
            >
              {detail}
            </span>
          ) : null}
        </span>
      </label>
      {checked && children ? <div className="pl-10">{children}</div> : null}
    </li>
  );
}

export function CheckList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {children}
    </ul>
  );
}

export interface OptionGroupProps<Id extends string> {
  legend: ReactNode;
  options: readonly { id: Id; label: string }[];
  value: Id | null;
  onChange: (id: Id) => void;
  /** Colunas no celular; no desktop as opções ficam lado a lado. */
  columns?: 2 | 3 | 4;
  className?: string;
}

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/** Escolha única como rádio nativo (setas do teclado, "1 de 4" no leitor de tela). */
export function OptionGroup<Id extends string>({
  legend,
  options,
  value,
  onChange,
  columns = 2,
  className,
}: OptionGroupProps<Id>) {
  const name = useId();
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className="mb-1.5 text-[0.8125rem] font-medium text-muted-foreground">
        {legend}
      </legend>
      <div className={cn('grid gap-1.5', COLUMNS[columns])}>
        {options.map((option) => {
          const checked = value === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                checked
                  ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                  : 'border-border bg-background text-foreground hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={checked}
                onChange={() => onChange(option.id)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Letras do mnemônico (CRASH, LEMON, ROMAN) com a contagem. As letras são
 * decorativas para quem enxerga; o leitor de tela recebe a frase.
 */
export function Mnemonic({
  name,
  letters,
  active,
  tone,
}: {
  name: string;
  letters: readonly string[];
  /** Posição de cada letra marcada (LEMON e ROMAN repetem letras). */
  active: readonly boolean[];
  tone: Tone;
}) {
  const count = active.filter(Boolean).length;
  const marked = letters.filter((_, index) => active[index]).join(', ');
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3">
      <div aria-hidden="true" className="flex gap-1">
        {letters.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className={cn(
              'flex size-8 items-center justify-center rounded-md border text-sm font-bold',
              active[index]
                ? cn('border-transparent', toneTag[tone])
                : 'border-border text-muted-foreground',
            )}
          >
            {letter}
          </span>
        ))}
      </div>
      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
        <span aria-hidden="true">{count}/5</span>
        <span className="sr-only">
          {name}: {count} de 5{marked ? ` (${marked})` : ''}
        </span>
      </span>
    </div>
  );
}
