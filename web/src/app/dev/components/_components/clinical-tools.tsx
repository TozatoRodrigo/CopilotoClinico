'use client';

import { useMemo, useState } from 'react';
import { evaluateCalculator, type CalculatorEvaluation } from '@clinical-tools/calculator';
import { buildChartNote } from '@clinical-tools/chart-note';
import { CHADSVASC } from '@clinical-tools/calculators/chadsvasc';
import { SHOCK_INDEX } from '@clinical-tools/calculators/shock-index';
import { CalculatorResult } from '@/components/domain/clinical-tools/calculator-result';
import { CalculatorView } from '@/components/domain/clinical-tools/calculator-view';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import {
  ContentProvenanceNote,
  ReferenceSection,
} from '@/components/domain/clinical-tools/reference-section';
import { ScoreItemList } from '@/components/domain/clinical-tools/score-item-list';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { ShowcaseSection, Specimen } from './showcase';

/** Uma resposta de cada faixa do índice de choque, para mostrar os três tons. */
const TONE_EXAMPLES: { title: string; hr: string; sbp: string }[] = [
  { title: 'Neutro (baixo risco)', hr: '72', sbp: '120' },
  { title: 'Atenção (muda a conduta)', hr: '96', sbp: '120' },
  { title: 'Crítico', hr: '130', sbp: '90' },
];

function toneExample(hr: string, sbp: string): CalculatorEvaluation {
  return evaluateCalculator(SHOCK_INDEX, { inputs: { hr, sbp } });
}

function ScoreSpecimen() {
  const [answers, setAnswers] = useState<Record<string, string | undefined>>({ htn: 'sim' });
  const evaluation = useMemo(() => evaluateCalculator(CHADSVASC, { items: answers }), [answers]);
  return (
    <div className="flex flex-col gap-4">
      <ScoreItemList
        items={CHADSVASC.items}
        answers={answers}
        onAnswer={(itemId, optionId) =>
          setAnswers((current) => ({ ...current, [itemId]: optionId }))
        }
      />
      <CalculatorResult definition={CHADSVASC} evaluation={evaluation} />
    </div>
  );
}

function FieldsSpecimen() {
  const [heartRate, setHeartRate] = useState('110');
  const [adult, setAdult] = useState('72,5');
  const [child, setChild] = useState('');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NumericField
        label="Frequência cardíaca"
        unit="bpm"
        range={{ min: 30, max: 250 }}
        value={heartRate}
        onValueChange={setHeartRate}
      />
      <WeightField population="adulto" value={adult} onValueChange={setAdult} />
      <WeightField
        population="pediatrico"
        label="Peso da criança"
        value={child}
        onValueChange={setChild}
      />
    </div>
  );
}

const SAMPLE_RESULT = toneExample('110', '90');
const SAMPLE_NOTE =
  SAMPLE_RESULT.status === 'complete' ? buildChartNote(SHOCK_INDEX, SAMPLE_RESULT) : null;

/**
 * CC-305 — componentes clínicos das Ferramentas (ADR-017), com conteúdo real
 * das calculadoras portadas. Os testes de acessibilidade ficam em
 * components/domain/clinical-tools/__tests__.
 */
export function ClinicalToolsSection() {
  return (
    <ShowcaseSection
      id="ferramentas"
      title="Ferramentas clínicas"
      description="Campos, escore, resultado e referência das calculadoras de beira-leito (ADR-017). Vírgula decimal, unidade sempre visível, resultado ao vivo e cor só pelo significado clínico."
    >
      <Specimen
        title="Aviso fixo"
        note="Em toda ferramenta, sem botão de fechar. Neutro: não é alerta que muda conduta."
      >
        <DecisionSupportNotice />
      </Specimen>

      <Specimen
        title="Campo numérico e campo de peso"
        note="Aceita vírgula ou ponto; a unidade fica dentro do campo. Fora da faixa: erro e nada é calculado (adulto 40–200 kg, pediátrico 0,5–50 kg). Digite 300 na FC ou 1.500 no peso para ver os erros."
      >
        <FieldsSpecimen />
      </Specimen>

      <Specimen
        title="Itens de escore com resultado ao vivo"
        note="Rádio nativo por item (setas do teclado funcionam); o resultado aparece quando o último item é respondido, sem botão Calcular."
      >
        <ScoreSpecimen />
      </Specimen>

      <Specimen
        title="Caixa de resultado"
        note="Verde do ANY → cinza (verde aqui é conduta confirmada); amarelo → laranja; vermelho → vermelho. O nome da faixa vai sempre junto."
      >
        <div className="flex flex-col gap-3">
          {TONE_EXAMPLES.map(({ title, hr, sbp }) => (
            <div key={title} className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">{title}</p>
              <CalculatorResult definition={SHOCK_INDEX} evaluation={toneExample(hr, sbp)} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <CalculatorResult definition={SHOCK_INDEX} evaluation={toneExample('110', '')} />
          </div>
        </div>
      </Specimen>

      <Specimen
        title="Copiar para o prontuário"
        note="Resultado, faixa, respostas, sugestão e referência, sem dado de paciente."
      >
        <CopyToChartButton text={SAMPLE_NOTE} />
      </Specimen>

      <Specimen
        title="Seção de referência"
        note="Por que usar, quando usar, pérolas e armadilhas, e a citação; com a procedência do conteúdo."
      >
        <div className="flex flex-col gap-3">
          <ReferenceSection reference={CHADSVASC.reference} defaultOpen />
          <ContentProvenanceNote provenance={CHADSVASC.provenance} />
        </div>
      </Specimen>

      <Specimen
        title="Calculadora completa"
        note="O que a rota /ferramentas/calculadoras/shock-index renderiza abaixo do título."
      >
        <CalculatorView definition={SHOCK_INDEX} />
      </Specimen>
    </ShowcaseSection>
  );
}
