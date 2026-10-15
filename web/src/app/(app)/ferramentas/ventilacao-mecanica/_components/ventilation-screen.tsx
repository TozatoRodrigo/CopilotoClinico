'use client';

import { useState, type ReactNode } from 'react';
import { Gauge } from '@phosphor-icons/react';
import { VENTILATION_CALCULATIONS } from '@clinical-tools/ventilation/calculations';
import {
  VENTILATION_PROVENANCE,
  VENTILATION_REFERENCE_LIST,
  VENTILATION_TOOL_NAME,
} from '@clinical-tools/ventilation/content';
import { VENTILATION_SECTIONS } from '@clinical-tools/ventilation/types';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { Disclosure } from '@/components/ui/disclosure';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from '../../_components/tool-entries';
import { HacorPanel } from './hacor-panel';
import { SdraCriteria } from './sdra-section';
import {
  EMPTY_ANSWERS,
  VentilationCalculator,
  type CalculationAnswers,
} from './ventilation-calculator';

/** Atalhos do topo (o menu flutuante do ANY), com rótulo curto para caber no celular. */
const JUMPS: readonly { id: string; label: string }[] = [
  { id: 'peso', label: 'Peso predito' },
  { id: 'mecanica', label: 'Mecânica' },
  { id: 'troca', label: 'Troca gasosa' },
  { id: 'desmame', label: 'Desmame' },
  { id: 'outros', label: 'Outros' },
  { id: 'sdra', label: 'SDRA' },
  { id: 'hacor', label: 'HACOR' },
  { id: 'referencias', label: 'Referências' },
];

function anchor(id: string): string {
  return `vm-${id}`;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const headingId = `${anchor(id)}-titulo`;
  return (
    <section
      id={anchor(id)}
      aria-labelledby={headingId}
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader
        title={<span id={headingId}>{title}</span>}
        className="border-b border-border pb-1.5"
      />
      {children}
    </section>
  );
}

/**
 * /ferramentas/ventilacao-mecanica — o VM Guide do ANY (CC-327): as 14
 * contas em seções, os critérios de SDRA (Global 2024) e o HACOR com
 * reavaliação. Celular primeiro: atalhos no topo, cada conta abre no lugar e
 * as respostas ficam guardadas enquanto a tela está aberta.
 */
export function VentilationScreen() {
  const favorites = useToolFavorites();
  const [answers, setAnswers] = useState<Record<string, CalculationAnswers>>({});

  return (
    <Page width="narrow">
      <PageHeader
        icon={Gauge}
        iconTone="blue"
        title={VENTILATION_TOOL_NAME}
        description="Peso predito, mecânica respiratória, troca gasosa, desmame, SDRA e HACOR. A conta é feita no aparelho."
        actions={
          <FavoriteButton
            favoriteKey="tool:ventilacao-mecanica"
            name={VENTILATION_TOOL_NAME}
            favorites={favorites}
          />
        }
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <nav aria-label="Seções da ventilação mecânica">
          <ul className="flex flex-wrap gap-1.5">
            {JUMPS.map((jump) => (
              <li key={jump.id}>
                <a
                  href={`#${anchor(jump.id)}`}
                  className="flex min-h-10 items-center rounded-md border border-border px-3 text-sm text-foreground transition-colors duration-100 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  {jump.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {VENTILATION_SECTIONS.map((section) => (
        <Section key={section.id} id={section.id} title={section.label}>
          <div className="flex flex-col">
            {VENTILATION_CALCULATIONS.filter(
              (calculation) => calculation.section === section.id,
            ).map((calculation) => (
              <Disclosure
                key={calculation.id}
                title={calculation.name}
                // Alvo de toque de 44 px no gatilho (o padrão do Disclosure é baixo).
                className="border-b border-border last:border-b-0 [&>button]:min-h-11"
                contentClassName="pl-0"
              >
                <div className="pt-2 pb-3">
                  <VentilationCalculator
                    calculation={calculation}
                    answers={answers[calculation.id] ?? EMPTY_ANSWERS}
                    onAnswersChange={(next) =>
                      setAnswers((current) => ({ ...current, [calculation.id]: next }))
                    }
                  />
                </div>
              </Disclosure>
            ))}
          </div>
        </Section>
      ))}

      <Section id="sdra" title="Critérios de SDRA (Global 2024)">
        <SdraCriteria />
      </Section>

      <Section id="hacor" title="HACOR (falha de VNI)">
        <HacorPanel />
      </Section>

      <Section id="referencias" title="Referências">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-pretty text-muted-foreground">
          {VENTILATION_REFERENCE_LIST.map((reference) => (
            <li key={reference}>{reference}</li>
          ))}
        </ol>
        <ContentProvenanceNote provenance={VENTILATION_PROVENANCE} />
      </Section>
    </Page>
  );
}
