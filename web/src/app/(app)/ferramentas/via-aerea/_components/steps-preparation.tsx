'use client';

import Link from 'next/link';
import {
  FLUSH_RATE,
  MEMBRANE_METHODS,
  MEMBRANE_TECHNIQUES,
  NOTICES,
} from '@clinical-tools/airway/content';
import { AIRWAY_RANGES } from '@clinical-tools/airway/vitals';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Disclosure } from '@/components/ui/disclosure';
import { NoticeCallout, OptionGroup } from './airway-parts';
import { ChecklistSection } from './checklist-section';
import { infusionsHref } from './infusions-link';
import type { StepProps } from './step-props';

/** Passo 5 — triple setup: planos A, B e C preparados antes da indução. */
export function TripleSetupStep(props: StepProps) {
  const { state, view, dispatch } = props;
  const technique =
    state.membrane && state.membrane !== 'nao' ? MEMBRANE_TECHNIQUES[state.membrane] : null;
  return (
    <div className="flex flex-col gap-5">
      {view.crashCount > 0 || view.difficultAnatomy ? (
        <NoticeCallout notice={NOTICES.riscoElevado} />
      ) : null}
      {view.difficultAnatomy ? <NoticeCallout notice={NOTICES.vadDificil} /> : null}

      <ChecklistSection checklist="planoA" {...props} />

      <ChecklistSection checklist="planoB" {...props}>
        {view.heightCm === null ? (
          <NumericField
            id="via-aerea-altura-tl"
            label="Altura, para o tamanho do tubo laríngeo"
            unit={AIRWAY_RANGES.height.unit}
            range={AIRWAY_RANGES.height}
            value={state.height}
            onValueChange={(raw) => dispatch({ type: 'set-height', raw })}
            placeholder="170"
          />
        ) : null}
      </ChecklistSection>

      <ChecklistSection checklist="planoC" {...props}>
        <OptionGroup
          legend="Membrana cricotireóidea identificada?"
          options={MEMBRANE_METHODS}
          value={state.membrane}
          onChange={(method) => dispatch({ type: 'set-membrane', method })}
          columns={3}
        />
        {technique ? (
          <Disclosure title={technique.title} defaultOpen>
            <ul className="flex flex-col gap-1 text-sm text-foreground">
              {technique.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </ChecklistSection>
    </div>
  );
}

/** Passo 6 — otimização hemodinâmica e posicionamento. */
export function OptimizationStep(props: StepProps) {
  const href = infusionsHref('noradrenalina');
  return (
    <div className="flex flex-col gap-5">
      {props.view.hemodynamicInstability ? (
        <NoticeCallout
          notice={NOTICES.instabilidade}
          action={
            href ? (
              <Link
                href={href}
                className="text-sm font-medium text-link underline-offset-4 hover:underline"
              >
                Calculadora de noradrenalina →
              </Link>
            ) : undefined
          }
        />
      ) : null}
      <ChecklistSection checklist="hemodinamica" {...props} />
      <ChecklistSection checklist="posicionamento" {...props} />
    </div>
  );
}

/** Passo 7 — pré-oxigenação e oxigenação apneica. */
export function PreoxygenationStep(props: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <ChecklistSection checklist="preOxigenacao" {...props}>
        <Disclosure title={`O que é ${FLUSH_RATE.title.toLowerCase()}?`}>
          <div className="flex flex-col gap-2 text-sm text-foreground">
            {FLUSH_RATE.lines.map((line) => (
              <p key={line} className="text-pretty">
                {line}
              </p>
            ))}
          </div>
        </Disclosure>
      </ChecklistSection>
      <ChecklistSection checklist="oxigenacaoApneica" {...props} />
    </div>
  );
}
