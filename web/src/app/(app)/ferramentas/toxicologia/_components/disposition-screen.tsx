'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowCounterClockwise, Info, WarningCircle } from '@phosphor-icons/react';
import {
  assessDisposition,
  buildDispositionChartNote,
  checkedCountLabel,
  DISPOSITION_CRITERIA,
  DISPOSITION_GROUPS,
  DISPOSITION_INTRO,
  DISPOSITION_NOTES,
} from '@clinical-tools/toxicology/disposition';
import { toxModuleHref } from '@clinical-tools/toxicology/modules';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { SectionHeader } from '@/components/layout/page-header';
import { toneBg, toneInk } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { CheckRow } from './check-row';

/**
 * Critérios de destino (CC-323): o médico marca o que o paciente tem e o
 * destino sugerido se atualiza (qualquer critério de UTI → UTI). O resultado
 * fica preso no topo enquanto a lista rola, como a barra fixa do ANY.
 */
export function DispositionScreen() {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const assessment = assessDisposition(checked);
  const tone = RESULT_TONE[assessment.disposition.tone];
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];

  function toggle(id: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="gray" icon={<Info />}>
        {DISPOSITION_INTRO}
      </Callout>

      <div
        role="status"
        aria-live="polite"
        data-tone={tone}
        className={cn(
          'sticky top-11 z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg px-4 py-3 shadow-sm',
          toneBg[tone],
        )}
      >
        <span className={cn('text-lg font-semibold', ink)}>{assessment.disposition.label}</span>
        <span className={cn('text-sm', ink)}>{checkedCountLabel(assessment.checked.length)}</span>
      </div>

      {DISPOSITION_GROUPS.map((group) => (
        <section
          key={group.level}
          aria-labelledby={`destino-${group.level}`}
          className="flex flex-col gap-2"
        >
          <SectionHeader
            title={<span id={`destino-${group.level}`}>{group.title}</span>}
            description={group.description}
            className="border-b border-border pb-1.5"
          />
          <ul className="flex flex-col">
            {DISPOSITION_CRITERIA.filter(({ level }) => level === group.level).map((criterion) => (
              <li key={criterion.id}>
                <CheckRow
                  checked={checked.has(criterion.id)}
                  onChange={(on) => toggle(criterion.id, on)}
                  label={criterion.text}
                  description={
                    <>
                      {criterion.detail}
                      <span className="block text-xs">Ex.: {criterion.example}</span>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-col gap-3">
        <Callout tone="orange" icon={<WarningCircle />} title={DISPOSITION_NOTES.observation.title}>
          {DISPOSITION_NOTES.observation.text}
        </Callout>
        <Callout tone="gray" icon={<Info />} title={DISPOSITION_NOTES.discharge.title}>
          {DISPOSITION_NOTES.discharge.text}
        </Callout>
        <Callout
          tone="red"
          icon={<WarningCircle />}
          title={DISPOSITION_NOTES.delayedToxicity.title}
          action={
            <Button asChild variant="outline" className="h-11 max-sm:h-11">
              <Link href={`${toxModuleHref('tabelas')}#bombas`}>Ver bombas-relógio tóxicas</Link>
            </Button>
          }
        >
          {DISPOSITION_NOTES.delayedToxicity.text}
        </Callout>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <CopyToChartButton text={buildDispositionChartNote(assessment)} />
        <Button
          type="button"
          variant="ghost"
          disabled={checked.size === 0}
          onClick={() => setChecked(new Set())}
        >
          <ArrowCounterClockwise aria-hidden="true" />
          Limpar todas as marcações
        </Button>
      </div>
    </div>
  );
}
