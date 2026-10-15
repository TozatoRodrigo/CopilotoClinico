'use client';

import { useId, type ElementType, type ReactNode } from 'react';
import Link from 'next/link';
import { CaretRight, Syringe } from '@phosphor-icons/react';
import { BLOCKS_PROVENANCE } from '@clinical-tools/blocks/content';
import {
  BLOCK_SECTIONS,
  blockSectionHref,
  type BlockSectionId,
} from '@clinical-tools/blocks/sections';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import type { Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';

const FOCUS_RING = 'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none';

/**
 * Página de uma seção dos bloqueios: cabeçalho, aviso fixo, conteúdo e, no
 * rodapé, as outras seções (para ir da dose ao LAST sem voltar ao início) e a
 * procedência do conteúdo.
 */
export function BlocksPage({
  title,
  description,
  icon = Syringe,
  iconTone = 'blue',
  current,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ElementType;
  iconTone?: Tone;
  /** Seção aberta; fica fora da lista do rodapé. */
  current?: BlockSectionId;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const others = BLOCK_SECTIONS.filter(({ id }) => id !== current);
  return (
    <Page width="narrow">
      <PageHeader
        icon={icon}
        iconTone={iconTone}
        size="compact"
        title={title}
        description={description}
        actions={actions}
      />
      <DecisionSupportNotice />
      {children}
      <footer className="flex flex-col gap-3 border-t border-border pt-4">
        <nav aria-label="Outras seções dos bloqueios">
          <ul className="flex flex-wrap gap-2">
            {others.map((section) => (
              <li key={section.id}>
                <Link
                  href={blockSectionHref(section.id)}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-hover',
                    FOCUS_RING,
                  )}
                >
                  {section.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ContentProvenanceNote provenance={BLOCKS_PROVENANCE} />
      </footer>
    </Page>
  );
}

/** Linha que abre outra página: a linha inteira é o alvo de toque (48px). */
export function LinkRow({
  href,
  title,
  description,
  trailing,
  icon: Icon,
}: {
  href: string;
  title: ReactNode;
  description?: ReactNode;
  /** Texto à direita (o bloqueio sugerido, o volume). */
  trailing?: ReactNode;
  icon?: ElementType;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-75 hover:bg-hover',
          FOCUS_RING,
        )}
      >
        {Icon ? (
          <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          {description ? (
            <span className="block text-xs text-muted-foreground">{description}</span>
          ) : null}
        </span>
        {trailing ? (
          <span className="shrink-0 text-right text-sm font-medium text-foreground">
            {trailing}
          </span>
        ) : null}
        <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

const FIELD_CLASS =
  'h-11 w-full min-w-0 rounded-md border border-input bg-surface-input px-3 text-base text-foreground transition-[border-color,box-shadow] duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25';

/** Seletor nativo: no celular abre o seletor do sistema, o mais acessível. */
export function SelectField({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onValueChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={FIELD_CLASS}
      >
        <option value="">Selecione…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextField({
  label,
  value,
  onValueChange,
  placeholder,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(FIELD_CLASS, 'placeholder:text-fg-tertiary')}
      />
    </div>
  );
}

/**
 * Escolha única em botões lado a lado (lateralidade, técnica, epinefrina):
 * rádio nativo por baixo, então setas do teclado e leitor de tela funcionam.
 * Tocar de novo na escolhida desmarca, como deixar o campo em branco.
 */
export function ChoiceGroup<T extends string>({
  legend,
  value,
  options,
  onValueChange,
  allowEmpty = true,
}: {
  legend: string;
  value: T | '';
  options: readonly { value: T; label: string }[];
  onValueChange: (value: T | '') => void;
  allowEmpty?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[0.8125rem] font-medium text-muted-foreground">
        {legend}
      </legend>
      <div className={cn('grid gap-1.5', options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                checked
                  ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                  : 'border-border bg-background text-foreground hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onValueChange(option.value)}
                onClick={() => {
                  if (checked && allowEmpty) onValueChange('');
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CheckboxRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-hover has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="size-5 shrink-0 cursor-pointer accent-primary"
      />
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}
