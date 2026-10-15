'use client';

import { useId, type ReactNode } from 'react';
import { CaretRight, Info, Warning, WarningOctagon } from '@phosphor-icons/react';
import {
  PREFER_IF_LABEL,
  SCREEN_INFO,
  SEDATION_CHOICES,
  YES_NO,
  type ChoiceSection,
  type MedicationOption,
  type RegimenCard,
  type SedationChoiceId,
  type SedationNotice,
  type SedationNoticeTone,
  type SedationScreen,
} from '@clinical-tools/sedation/content';
import {
  formatRegimen,
  medicationDoseLine,
  regimenTitle,
  REGIMENS,
} from '@clinical-tools/sedation/doses';
import type { ResultTone } from '@clinical-tools/tone';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Callout } from '@/components/ui/callout';
import type { Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Peças da tela da sedação. Todo texto clínico e toda dose vêm do motor
 * (`@clinical-tools/sedation`); aqui só há desenho e estado de formulário.
 */

/** Tom do aviso no design system: informação azul; os demais pelo ADR-017. */
export const NOTICE_TONE: Record<SedationNoticeTone, Tone> = { info: 'blue', ...RESULT_TONE };

const NOTICE_ICON: Record<SedationNoticeTone, ReactNode> = {
  info: <Info />,
  neutral: <Info />,
  attention: <Warning />,
  critical: <WarningOctagon />,
};

/** Linhas que já vêm numeradas ("1. Reposicionar VA…") não ganham marcador. */
const NUMBERED = /^\d+\.\s/;

/** Aviso do roteiro: callout com ícone e texto (estado nunca só por cor). */
export function NoticeCallout({ notice }: { notice: SedationNotice }) {
  const { lines } = notice;
  return (
    <Callout tone={NOTICE_TONE[notice.tone]} icon={NOTICE_ICON[notice.tone]} title={notice.title}>
      {lines.length === 1 ? (
        lines[0]
      ) : (
        <ul
          className={cn(
            'flex flex-col gap-0.5',
            !lines.every((line) => NUMBERED.test(line)) && 'list-disc pl-4',
          )}
        >
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </Callout>
  );
}

/** Bloco com título (seção da tela). Estrutura por espaço e tipografia, sem cartão colorido. */
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

/** Peso da escolha (verde, amarelo e vermelho do ANY) como faixa à esquerda; o título diz o resto. */
const TONE_BAR: Record<ResultTone, string> = {
  neutral: 'border-l-4 border-l-tone-gray',
  attention: 'border-l-4 border-l-tone-orange',
  critical: 'border-l-4 border-l-tone-red',
};

/** Cartões de opção do roteiro: cada um abre a próxima tela. */
export function ChoiceList({
  section,
  choices,
  onChoose,
}: {
  section: ChoiceSection;
  choices: readonly SedationChoiceId[];
  onChoose: (choice: SedationChoiceId) => void;
}) {
  const list = (
    <ul className="flex flex-col gap-2">
      {choices.map((id) => {
        const choice = SEDATION_CHOICES[id];
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onChoose(id)}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors duration-100 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                choice.tone && TONE_BAR[choice.tone],
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-medium text-foreground">
                  {choice.title}
                </span>
                <span className="block text-xs text-muted-foreground">{choice.description}</span>
              </span>
              <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
  if (!section.title) {
    return (
      <div className="flex flex-col gap-2">
        {section.prompt ? <p className="text-sm text-muted-foreground">{section.prompt}</p> : null}
        {list}
      </div>
    );
  }
  return (
    <Block title={section.title} description={section.prompt}>
      {list}
    </Block>
  );
}

/** Regime em destaque: a dose principal grande e as alternativas ("ou …") abaixo. */
export function RegimenCardView({ card }: { card: RegimenCard }) {
  const headingId = useId();
  const [main, ...alternatives] = card.regimens;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1 rounded-md border border-border px-4 py-3"
    >
      <h3 id={headingId} className="text-sm font-medium text-muted-foreground">
        {card.title}
      </h3>
      {main ? (
        <p className="text-lg font-semibold text-foreground tabular-nums">
          {formatRegimen(REGIMENS[main], { names: true })}
        </p>
      ) : null}
      {alternatives.map((id) => (
        <p key={id} className="text-[0.9375rem] text-foreground tabular-nums">
          ou {formatRegimen(REGIMENS[id], { names: true })}
        </p>
      ))}
      {card.notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}

const RADIO_LABEL =
  'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40';
const RADIO_ON = 'border-primary bg-tone-blue-bg text-tone-blue-ink';
const RADIO_OFF = 'border-border bg-background text-foreground hover:bg-hover';

/** "Sedação nas últimas 4 h?" como rádio nativo Não/Sim (o Toggle do ANY). */
export function YesNoQuestion({
  question,
  answer,
  onAnswer,
}: {
  question: string;
  answer: boolean;
  onAnswer: (value: boolean) => void;
}) {
  const name = useId();
  const options = [
    { value: false, label: YES_NO.no },
    { value: true, label: YES_NO.yes },
  ];
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-semibold text-foreground">{question}</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => {
          const checked = answer === option.value;
          return (
            <label
              key={option.label}
              className={cn(RADIO_LABEL, 'items-center', checked ? RADIO_ON : RADIO_OFF)}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onAnswer(option.value)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className={cn(checked && 'font-medium')}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Opções de medicação (o MedOption do ANY): rádio com nome, via e dose, início de ação e quando preferir. */
export function MedicationOptions<Id extends string>({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: readonly MedicationOption<Id>[];
  selected: Id | null;
  onSelect: (id: Id) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-base font-semibold text-foreground">{legend}</legend>
      {options.map((option) => {
        const regimen = REGIMENS[option.regimen];
        const checked = selected === option.id;
        return (
          <label
            key={option.id}
            data-medication={option.id}
            className={cn(RADIO_LABEL, checked ? RADIO_ON : RADIO_OFF)}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={checked}
              onChange={() => onSelect(option.id)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.9375rem] font-semibold">{regimenTitle(regimen)}</span>
              <span className="font-medium tabular-nums">{medicationDoseLine(regimen)}</span>
              <span className={cn('text-xs', !checked && 'text-muted-foreground')}>
                {option.timing}
              </span>
              {option.preferIf ? (
                <span className={cn('text-xs', !checked && 'text-muted-foreground')}>
                  <span className="font-medium">{PREFER_IF_LABEL}</span> {option.preferIf}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export interface CheckRowProps {
  title: ReactNode;
  checked: boolean;
  onToggle: () => void;
  /** Conteúdo quando marcado (o alerta do red flag). */
  children?: ReactNode;
}

/**
 * Item marcável: checkbox nativo dentro do rótulo (alvo de toque de 44px,
 * espaço marca, leitor de tela anuncia o estado). Marcado fica no tom de
 * seleção (azul), como nas outras ferramentas.
 */
export function CheckRow({ title, checked, onToggle, children }: CheckRowProps) {
  return (
    <li className="flex flex-col gap-1.5">
      <label className={cn(RADIO_LABEL, checked ? RADIO_ON : RADIO_OFF)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1 font-medium">{title}</span>
      </label>
      {checked && children ? <div className="pl-3">{children}</div> : null}
    </li>
  );
}

/** Caminho percorrido no roteiro (a trilha do ANY), a tela atual por último. */
export function Trail({ path }: { path: readonly SedationScreen[] }) {
  return (
    <nav aria-label="Caminho no roteiro">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {path.map((screen, index) => {
          const current = index === path.length - 1;
          return (
            <li key={screen} className="flex items-center gap-1.5">
              {index > 0 ? <CaretRight className="size-3" aria-hidden="true" /> : null}
              <span
                aria-current={current ? 'step' : undefined}
                className={cn(current && 'font-medium text-foreground')}
              >
                {SCREEN_INFO[screen].trail}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Linha de resultado: rótulo à esquerda, valor com unidade à direita. */
export function DoseRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-semibold text-foreground tabular-nums',
          emphasis ? 'text-xl' : 'text-base',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
