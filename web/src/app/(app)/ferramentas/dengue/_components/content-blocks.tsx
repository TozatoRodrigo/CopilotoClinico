'use client';

import { Fragment, useId, type ReactNode } from 'react';
import {
  DENGUE_GROUP_INFO,
  HEMATOCRIT_FORM,
  type DengueBlock,
  type DengueGroup,
  type DengueScreen,
  type DengueSection,
  type SectionBadge,
  type VolumeFigure,
} from '@clinical-tools/dengue/content';
import { HEMATOCRIT_RANGE, type HematocritEvaluation } from '@clinical-tools/dengue/hematocrit';
import {
  fillVolumeText,
  formatFigureDetail,
  formatMilliliters,
  type DengueHydration,
} from '@clinical-tools/dengue/hydration';
import type { ResultTone } from '@clinical-tools/tone';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { toneBg, toneInk, toneTag, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Desenho dos blocos de conteúdo da dengue (CC-325). Todo texto, dose e
 * volume vem do motor (`@clinical-tools/dengue`); aqui só há layout.
 */

/** `**texto**` do conteúdo vira ênfase. */
export function Emphasis({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, index) =>
        // Partes ímpares estavam entre ** e **.
        index % 2 === 1 ? (
          <strong key={index} className="font-semibold">
            {part}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const BADGE_VARIANT: Record<ResultTone, 'gray' | 'warning' | 'destructive'> = {
  neutral: 'gray',
  attention: 'warning',
  critical: 'destructive',
};

export function ToneBadge({ badge }: { badge: SectionBadge }) {
  return <Badge variant={BADGE_VARIANT[badge.tone]}>{badge.label}</Badge>;
}

/** "Grupo C · Internação" no tom do grupo: estado nunca só por cor. */
export function GroupBadge({ group, className }: { group: DengueGroup; className?: string }) {
  const info = DENGUE_GROUP_INFO[group];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-sm font-medium',
        toneTag[RESULT_TONE[info.tone]],
        className,
      )}
    >
      Grupo {group} · {info.label}
    </span>
  );
}

function FigureCard({
  figure,
  hydration,
}: {
  figure: VolumeFigure;
  hydration: DengueHydration | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2.5">
      {figure.caption ? (
        <span className="text-xs text-muted-foreground">{figure.caption}</span>
      ) : null}
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-semibold text-foreground tabular-nums">
          {formatMilliliters(hydration ? hydration[figure.volume] : null)}
        </span>
        <span className="text-sm text-muted-foreground">{figure.unit}</span>
      </span>
      {figure.detail ? (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatFigureDetail(figure.detail, hydration)}
        </span>
      ) : null}
    </div>
  );
}

function StepsList({ start = 1, items }: Extract<DengueBlock, { kind: 'steps' }>) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-tone-gray-tag text-xs font-semibold text-tone-gray-ink"
          >
            {start + index}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              <span className="sr-only">{start + index}. </span>
              {item.title}
            </p>
            <p className="text-sm text-pretty text-foreground">{item.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface HematocritProps {
  baseline: string;
  current: string;
  evaluation: HematocritEvaluation;
  onBaselineChange: (raw: string) => void;
  onCurrentChange: (raw: string) => void;
}

function HematocritCalculator({
  baseline,
  current,
  evaluation,
  onBaselineChange,
  onCurrentChange,
}: HematocritProps) {
  const tone = evaluation.status === 'complete' ? RESULT_TONE[evaluation.band.tone] : null;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{HEMATOCRIT_FORM.label}</p>
        <p className="text-xs text-muted-foreground">{HEMATOCRIT_FORM.formula}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumericField
          label={HEMATOCRIT_FORM.baseline.label}
          unit={HEMATOCRIT_RANGE.unit}
          range={HEMATOCRIT_RANGE}
          value={baseline}
          onValueChange={onBaselineChange}
          placeholder={HEMATOCRIT_FORM.baseline.placeholder}
        />
        <NumericField
          label={HEMATOCRIT_FORM.current.label}
          unit={HEMATOCRIT_RANGE.unit}
          range={HEMATOCRIT_RANGE}
          value={current}
          onValueChange={onCurrentChange}
          placeholder={HEMATOCRIT_FORM.current.placeholder}
        />
      </div>
      <div
        role="status"
        aria-live="polite"
        data-state={evaluation.status}
        className={cn(
          'rounded-md px-3 py-2.5',
          tone ? toneBg[tone] : 'border border-dashed border-border',
        )}
      >
        {evaluation.status === 'complete' && tone ? (
          <div className="flex flex-col gap-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  tone === 'gray' ? 'text-foreground' : toneInk[tone],
                )}
              >
                {evaluation.display}
              </span>
              <span className="text-sm text-muted-foreground">{HEMATOCRIT_FORM.resultUnit}</span>
            </span>
            <span
              className={cn('w-fit rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}
            >
              {evaluation.band.label}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{HEMATOCRIT_FORM.pending}</span>
        )}
      </div>
    </div>
  );
}

/** O que os blocos precisam da tela: volumes do peso, navegação e o Ht. */
export interface BlockContext {
  hydration: DengueHydration | null;
  open: (screen: DengueScreen) => void;
  reclassify: (group: DengueGroup) => void;
  hematocrit: HematocritProps;
}

const RECLASSIFY_VARIANT: Record<ResultTone, 'outline' | 'destructive'> = {
  neutral: 'outline',
  attention: 'outline',
  critical: 'destructive',
};

export function ContentBlock({ block, context }: { block: DengueBlock; context: BlockContext }) {
  const { hydration } = context;
  switch (block.kind) {
    case 'notice': {
      const tone = RESULT_TONE[block.tone];
      return (
        <Callout tone={tone} title={block.title}>
          {block.text ? <Emphasis text={fillVolumeText(block.text, hydration)} /> : null}
          {block.items ? (
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </Callout>
      );
    }
    case 'note':
      return (
        <div className="border-l-2 border-border py-0.5 pl-3 text-sm">
          <p className="font-semibold text-foreground">{block.title}</p>
          {block.text ? (
            <p className="text-pretty text-foreground">
              <Emphasis text={fillVolumeText(block.text, hydration)} />
            </p>
          ) : null}
          {block.items ? (
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-foreground">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case 'paragraph':
      return (
        <p
          className={cn(
            'text-sm text-pretty',
            block.muted ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          <Emphasis text={block.text} />
        </p>
      );
    case 'list':
      return (
        <ul
          className={cn(
            'flex list-disc flex-col gap-1 pl-5 text-sm',
            block.tone === 'critical' ? toneText.red : 'text-foreground',
          )}
        >
          {block.items.map((item) => (
            <li key={item} className="text-pretty">
              {item}
            </li>
          ))}
        </ul>
      );
    case 'volumes':
      return (
        <section className="flex flex-col gap-2" aria-label={block.label}>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">
            {fillVolumeText(block.label, hydration)}
          </p>
          <div
            className={cn('grid gap-2', block.figures.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}
          >
            {block.figures.map((figure, index) => (
              <div
                key={`${figure.volume}-${index}`}
                className={cn(block.figures.length === 3 && index === 0 && 'col-span-2')}
              >
                <FigureCard figure={figure} hydration={hydration} />
              </div>
            ))}
          </div>
          {block.note ? <p className="text-xs text-muted-foreground">{block.note}</p> : null}
        </section>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th
                    key={cell}
                    scope="col"
                    className="border-b border-border px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-b-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2 py-1.5 align-top text-foreground">
                      {typeof cell === 'string' ? cell : <GroupBadge group={cell.group} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'steps':
      return <StepsList {...block} />;
    case 'reclassify':
      return (
        <Button
          type="button"
          variant={RECLASSIFY_VARIANT[DENGUE_GROUP_INFO[block.to].tone]}
          className="h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal"
          onClick={() => context.reclassify(block.to)}
        >
          {block.label}
        </Button>
      );
    case 'link':
      return (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal"
          onClick={() => context.open(block.to)}
        >
          {block.label}
        </Button>
      );
    case 'hematocrit':
      return <HematocritCalculator {...context.hematocrit} />;
  }
}

export function ContentBlocks({
  blocks,
  context,
}: {
  blocks: readonly DengueBlock[] | undefined;
  context: BlockContext;
}) {
  if (!blocks || blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => (
        <ContentBlock key={index} block={block} context={context} />
      ))}
    </div>
  );
}

/**
 * Título de seção recolhível com alvo de toque de 44 px no celular: o
 * `Disclosure` do design system é compacto (feito para detalhe secundário), e
 * aqui as seções são o conteúdo principal.
 */
export function TouchTitle({ children }: { children: ReactNode }) {
  return <span className="flex min-h-9 items-center gap-1.5">{children}</span>;
}

/** Seção recolhível, fechada por padrão como no ANY. */
export function ContentSection({
  section,
  context,
  defaultOpen = false,
}: {
  section: DengueSection;
  context: BlockContext;
  defaultOpen?: boolean;
}) {
  return (
    <Disclosure
      title={<TouchTitle>{section.title}</TouchTitle>}
      meta={section.badge ? <ToneBadge badge={section.badge} /> : undefined}
      defaultOpen={defaultOpen}
      className="border-b border-border pb-1"
    >
      <ContentBlocks blocks={section.blocks} context={context} />
    </Disclosure>
  );
}

/** Lista de caixas de marcar (sinais), com caixa nativa e alvo de toque de 44 px. */
export function SignChecklist<Id extends string>({
  legend,
  items,
  checked,
  onToggle,
  tone,
}: {
  legend: ReactNode;
  items: readonly { id: Id; label: string }[];
  checked: readonly Id[];
  onToggle: (id: Id) => void;
  tone?: ResultTone;
}) {
  const groupId = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend
        className={cn(
          'mb-1.5 text-sm font-semibold',
          tone && tone !== 'neutral' ? toneText[RESULT_TONE[tone]] : 'text-foreground',
        )}
      >
        {legend}
      </legend>
      {items.map((item) => {
        const isChecked = checked.includes(item.id);
        const id = `${groupId}-${item.id}`;
        return (
          <label
            key={item.id}
            htmlFor={id}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
              isChecked
                ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                : 'border-border bg-background text-foreground hover:bg-hover',
            )}
          >
            <input
              id={id}
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(item.id)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1 text-pretty">{item.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
