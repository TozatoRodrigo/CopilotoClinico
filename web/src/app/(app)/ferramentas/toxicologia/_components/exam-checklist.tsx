'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import {
  checklistItemKey,
  checklistProgress,
  EXAM_CHECKLIST,
} from '@clinical-tools/toxicology/checklist';
import { toxModuleHref } from '@clinical-tools/toxicology/modules';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Progress } from '@/components/ui/progress';
import { CheckRow } from './check-row';

/**
 * Checklist de avaliação (CC-323): os 32 itens do exame direcionado do ANY
 * em 6 seções fechadas, com o total marcado no topo. Só registra o que foi
 * examinado; não calcula nem sugere conduta.
 */
export function ExamChecklist() {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const progress = checklistProgress(checked);

  function toggle(key: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
        <p className="flex items-baseline justify-between text-sm text-foreground">
          <span className="font-medium">Itens avaliados</span>
          <span role="status" aria-live="polite" className="text-lg font-semibold tabular-nums">
            {progress.checked} / {progress.total}
          </span>
        </p>
        <Progress
          value={(progress.checked / progress.total) * 100}
          aria-label="Itens avaliados do checklist"
        />
      </div>

      <div className="flex flex-col">
        {EXAM_CHECKLIST.map((section) => (
          <Disclosure
            key={section.id}
            className="border-b border-border py-1 last:border-0 [&>button]:min-h-12"
            title={`${section.letter}. ${section.title}`}
            meta={`${progress.bySection[section.id] ?? 0}/${section.items.length}`}
          >
            <ul className="flex flex-col">
              {section.items.map((item) => {
                const key = checklistItemKey(section, item);
                return (
                  <li key={key}>
                    <CheckRow
                      checked={checked.has(key)}
                      onChange={(on) => toggle(key, on)}
                      label={item.label}
                      description={item.hint}
                    />
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="h-11 max-sm:h-11">
          <Link href={toxModuleHref('toxindromes')}>Identificar toxíndrome</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 max-sm:h-11"
          disabled={checked.size === 0}
          onClick={() => setChecked(new Set())}
        >
          <ArrowCounterClockwise aria-hidden="true" />
          Limpar
        </Button>
      </div>
    </div>
  );
}
