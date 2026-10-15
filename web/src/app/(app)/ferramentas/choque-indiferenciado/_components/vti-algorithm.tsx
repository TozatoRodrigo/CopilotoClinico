'use client';

import { useEffect, useRef } from 'react';
import { ArrowCounterClockwise, ArrowLeft, Info } from '@phosphor-icons/react';
import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import { YES_NO_OPTIONS } from '@clinical-tools/shock/septic-shock';
import { SHOCK_REFERENCES } from '@clinical-tools/shock/sources';
import {
  buildVtiChartNote,
  classifyVti,
  DISTRIBUTIVE_SCREEN,
  evaluateGreyZone,
  evaluateLowOutput,
  GREY_ZONE,
  GREY_ZONE_PATTERNS,
  LOW_OUTPUT_FLUIDS,
  LOW_OUTPUT_QUESTIONS,
  readVti,
  VTI_BAR_MAX,
  VTI_ENTRY,
  VTI_INPUT,
  VTI_MEASUREMENT,
  VTI_RESULT_INFUSIONS,
  VTI_SHOCK_TYPE_CONTENT,
  VTI_THRESHOLDS,
  vtiBarPosition,
  type VtiAction,
  type VtiShockType,
  type VtiState,
  type VtiZoneId,
} from '@clinical-tools/shock/vti';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { ChoiceQuestion } from '../../_components/shock/choice-question';
import { InfusionLinks } from '../../_components/shock/infusion-links';
import { BlockHint, BlockTitle, DataChips } from '../../_components/shock/roteiro-parts';
import { ToneResult } from '../../_components/shock/tone-result';

const MERCADAL = `${SHOCK_REFERENCES.mercadal.authors} ${SHOCK_REFERENCES.mercadal.citation}`;

/** Ação do botão de cada faixa do VTI (o próximo passo do algoritmo). */
const ZONE_ACTION: Record<VtiZoneId, VtiAction> = {
  'baixo-debito': { type: 'investigar-baixo-debito' },
  'zona-cinzenta': { type: 'avaliar-perfusao' },
  'debito-adequado': { type: 'choque-distributivo' },
};

interface VtiProps {
  state: VtiState;
  dispatch: (action: VtiAction) => void;
}

/** Barra de referência de 0 a 40 cm com os cortes de 16 e 20 cm, como a do ANY. */
function VtiBar({ value }: { value: number }) {
  const low = (VTI_THRESHOLDS.low / VTI_BAR_MAX) * 100;
  const high = (VTI_THRESHOLDS.high / VTI_BAR_MAX) * 100;
  const segments = [
    { tone: 'critical', width: low },
    { tone: 'attention', width: high - low },
    { tone: 'neutral', width: 100 - high },
  ] as const;
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{VTI_MEASUREMENT.barTitle}</p>
      <div className="relative h-3">
        <div className="flex h-full overflow-hidden rounded-sm">
          {segments.map(({ tone, width }) => (
            <span
              key={tone}
              className={cn('h-full', toneTag[RESULT_TONE[tone]])}
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
        <span
          className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${vtiBarPosition(value)}%` }}
        />
      </div>
      <div className="relative h-4 text-[0.6875rem] text-muted-foreground tabular-nums">
        {[0, VTI_THRESHOLDS.low, VTI_THRESHOLDS.high, VTI_BAR_MAX].map((mark) => (
          <span
            key={mark}
            className={cn(
              'absolute',
              mark === 0 ? '' : mark === VTI_BAR_MAX ? '-translate-x-full' : '-translate-x-1/2',
            )}
            style={{ left: `${vtiBarPosition(mark)}%` }}
          >
            {formatCompact(mark)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Cartão de um tipo de choque: achados, causas e conduta, no tom do ADR-017. */
function ShockTypeCard({ type }: { type: VtiShockType }) {
  const content = VTI_SHOCK_TYPE_CONTENT[type];
  return (
    <ToneResult tone={content.tone} title={content.label}>
      <div className="mt-1 flex flex-col gap-2">
        {content.sections.map((section) => (
          <div key={section.title}>
            <p className="font-semibold">{section.title}</p>
            <ul className="list-disc pl-5">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ToneResult>
  );
}

function BackButton({ onClick, label = 'Voltar' }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" variant="ghost" className="self-start" onClick={onClick}>
      <ArrowLeft aria-hidden="true" />
      {label}
    </Button>
  );
}

function ScreenTitle({
  title,
  subtitle,
  headingRef,
}: {
  title: string;
  subtitle: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="scroll-mt-16 text-xl font-semibold text-foreground outline-none"
      >
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function vtiChip(state: VtiState) {
  const vti = readVti(state);
  return [{ label: 'VTI', value: vti === null ? null : `${formatDecimal(vti, 1)} cm` }];
}

/** Investigação do baixo débito (VTI < 16 cm): pericárdio, VD, VE, valvas e volume. */
function LowOutputScreen({ state, dispatch }: VtiProps) {
  const answers = state.lowOutput;
  const evaluation = evaluateLowOutput(answers);
  const structural =
    evaluation.outcome !== null &&
    evaluation.outcome !== 'sem-causa' &&
    evaluation.outcome !== 'hipovolemico'
      ? evaluation.outcome
      : null;
  const method = answers.ventilation ? LOW_OUTPUT_FLUIDS.methods[answers.ventilation] : null;
  const seeSummary = (
    <Button type="button" onClick={() => dispatch({ type: 'ver-resumo' })}>
      Ver resumo
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      {evaluation.questions.map((id) => {
        const question = LOW_OUTPUT_QUESTIONS.find((candidate) => candidate.id === id);
        if (!question) return null;
        return (
          <div key={id} className="flex flex-col gap-1">
            <ChoiceQuestion
              id={`vti-${id}`}
              label={question.label}
              options={YES_NO_OPTIONS}
              value={answers[id]}
              onChange={(answer) => dispatch({ type: 'responder', question: id, answer })}
            />
            <BlockHint>{question.hint}</BlockHint>
          </div>
        );
      })}

      {structural ? (
        <div className="flex flex-col gap-3">
          <ShockTypeCard type={structural} />
          {VTI_SHOCK_TYPE_CONTENT[structural].infusions.length > 0 ? (
            <InfusionLinks drugs={VTI_SHOCK_TYPE_CONTENT[structural].infusions} />
          ) : null}
          <div>{seeSummary}</div>
        </div>
      ) : null}

      {evaluation.fluidBlock ? (
        <section aria-labelledby="vti-fluidos" className="flex flex-col gap-3">
          <BlockTitle id="vti-fluidos">{LOW_OUTPUT_FLUIDS.title}</BlockTitle>
          <BlockHint>{LOW_OUTPUT_FLUIDS.hint}</BlockHint>
          <ChoiceQuestion
            id="vti-ventilacao"
            label="Modo ventilatório"
            options={LOW_OUTPUT_FLUIDS.modes}
            value={answers.ventilation}
            onChange={(mode) => dispatch({ type: 'modo-ventilatorio', mode })}
          />
          {method ? (
            <Callout tone="gray" icon={<Info />} title={method.title}>
              <ul className="list-disc pl-5">
                {method.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-1">{method.alternative}</p>
            </Callout>
          ) : null}
          {evaluation.fluidQuestion ? (
            <ChoiceQuestion
              id="vti-responsivo"
              label={LOW_OUTPUT_FLUIDS.question}
              options={YES_NO_OPTIONS}
              value={answers.fluidResponsive}
              onChange={(answer) =>
                dispatch({ type: 'responder', question: 'fluidResponsive', answer })
              }
            />
          ) : null}
          {evaluation.outcome === 'hipovolemico' ? (
            <div className="flex flex-col gap-3">
              <ShockTypeCard type="hipovolemico" />
              <div>{seeSummary}</div>
            </div>
          ) : null}
          {evaluation.outcome === 'sem-causa' ? (
            <ToneResult
              tone={LOW_OUTPUT_FLUIDS.notResponsive.tone}
              title={LOW_OUTPUT_FLUIDS.notResponsive.title}
            >
              {LOW_OUTPUT_FLUIDS.notResponsive.text}
            </ToneResult>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Zona cinzenta (VTI 16–20 cm): SvcO2, gap de pCO2 e tendência do lactato decidem. */
function GreyZoneScreen({ state, dispatch }: VtiProps) {
  const pattern = evaluateGreyZone(state.greyZone);
  const toLowOutput = () => dispatch({ type: 'investigar-baixo-debito' });
  const toDistributive = () => dispatch({ type: 'choque-distributivo' });
  return (
    <div className="flex flex-col gap-5">
      <Callout tone="gray" icon={<Info />} title={GREY_ZONE.interpretation.title}>
        {GREY_ZONE.interpretation.text}
      </Callout>
      <div className="grid grid-cols-2 gap-3">
        <NumericField
          label={GREY_ZONE.inputs.svco2.label}
          unit={GREY_ZONE.inputs.svco2.unit}
          range={GREY_ZONE.inputs.svco2}
          value={state.greyZone.svco2}
          onValueChange={(raw) => dispatch({ type: 'digitar-zona-cinzenta', field: 'svco2', raw })}
          placeholder="65"
        />
        <NumericField
          label={GREY_ZONE.inputs.gapCO2.label}
          unit={GREY_ZONE.inputs.gapCO2.unit}
          range={GREY_ZONE.inputs.gapCO2}
          value={state.greyZone.gapCO2}
          onValueChange={(raw) => dispatch({ type: 'digitar-zona-cinzenta', field: 'gapCO2', raw })}
          placeholder="6"
        />
      </div>
      <ChoiceQuestion
        id="vti-lactato"
        label={GREY_ZONE.lactateTrend.label}
        options={GREY_ZONE.lactateTrend.options}
        value={state.greyZone.lactateTrend}
        onChange={(trend) => dispatch({ type: 'tendencia-do-lactato', trend })}
      />
      {pattern ? (
        <div className="flex flex-col gap-3">
          <ToneResult
            tone={GREY_ZONE_PATTERNS[pattern].tone}
            title={GREY_ZONE_PATTERNS[pattern].title}
          >
            {GREY_ZONE_PATTERNS[pattern].text}
          </ToneResult>
          <div className="flex flex-wrap gap-2">
            {pattern === 'baixo-debito' ? (
              <Button type="button" onClick={toLowOutput}>
                Investigar causa de baixo débito
              </Button>
            ) : null}
            {pattern === 'distributivo' ? (
              <Button type="button" onClick={toDistributive}>
                Choque distributivo
              </Button>
            ) : null}
            {pattern === 'inconclusivo' ? (
              <>
                <Button type="button" variant="outline" onClick={toLowOutput}>
                  Baixo débito
                </Button>
                <Button type="button" variant="outline" onClick={toDistributive}>
                  Distributivo
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Algoritmo de classificação pelo VTI (Mercadal et al. 2022), tela a tela
 * como no ANY: entrada, medida, baixo débito, zona cinzenta, distributivo e
 * resultado. O estado é o `vtiReducer` do motor.
 */
export function VtiAlgorithm({ state, dispatch }: VtiProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousScreen = useRef(state.screen);
  useEffect(() => {
    if (previousScreen.current === state.screen) return;
    previousScreen.current = state.screen;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView?.({ block: 'start' });
  }, [state.screen]);

  const go = (screen: VtiState['screen']) => dispatch({ type: 'ir-para', screen });
  const vti = readVti(state);

  switch (state.screen) {
    case 'inicio':
      return (
        <div className="flex flex-col gap-5">
          <ScreenTitle
            title={VTI_ENTRY.title}
            subtitle={VTI_ENTRY.subtitle}
            headingRef={headingRef}
          />
          <section aria-labelledby="vti-sinais" className="flex flex-col gap-2">
            <BlockTitle id="vti-sinais">{VTI_ENTRY.signsTitle}</BlockTitle>
            <ul className="list-disc pl-5 text-[0.9375rem] text-foreground">
              {VTI_ENTRY.signs.map((sign) => (
                <li key={sign}>{sign}</li>
              ))}
            </ul>
          </section>
          <Callout tone="gray" icon={<Info />} title={VTI_ENTRY.prerequisite.title}>
            {VTI_ENTRY.prerequisite.text}
          </Callout>
          <Button type="button" size="lg" onClick={() => go('medida')}>
            {VTI_ENTRY.start}
          </Button>
        </div>
      );
    case 'medida': {
      const zone = vti === null ? null : classifyVti(vti);
      return (
        <div className="flex flex-col gap-5">
          <BackButton onClick={() => go('inicio')} />
          <ScreenTitle
            title={VTI_MEASUREMENT.title}
            subtitle={VTI_MEASUREMENT.subtitle}
            headingRef={headingRef}
          />
          <Disclosure title={VTI_MEASUREMENT.howToTitle}>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-[0.9375rem] text-foreground">
              {VTI_MEASUREMENT.howTo.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Disclosure>
          <NumericField
            label={VTI_INPUT.label}
            unit={VTI_INPUT.unit}
            range={VTI_INPUT}
            value={state.vtiRaw}
            onValueChange={(raw) => dispatch({ type: 'digitar-vti', raw })}
            placeholder="18"
          />
          {zone && vti !== null ? (
            <div className="flex flex-col gap-3">
              <ToneResult
                tone={zone.tone}
                title={zone.title}
                action={
                  <Button type="button" onClick={() => dispatch(ZONE_ACTION[zone.id])}>
                    {zone.next}
                  </Button>
                }
              >
                {zone.text}
              </ToneResult>
              <VtiBar value={vti} />
            </div>
          ) : null}
        </div>
      );
    }
    case 'baixo-debito':
      return (
        <div className="flex flex-col gap-5">
          <BackButton onClick={() => go('medida')} />
          <ScreenTitle
            title="Baixo débito cardíaco"
            subtitle="VTI < 16 cm — investigação etiológica"
            headingRef={headingRef}
          />
          <DataChips items={vtiChip(state)} />
          <LowOutputScreen state={state} dispatch={dispatch} />
        </div>
      );
    case 'zona-cinzenta':
      return (
        <div className="flex flex-col gap-5">
          <BackButton onClick={() => go('medida')} />
          <ScreenTitle
            title={GREY_ZONE.title}
            subtitle={GREY_ZONE.subtitle}
            headingRef={headingRef}
          />
          <DataChips items={vtiChip(state)} />
          <GreyZoneScreen state={state} dispatch={dispatch} />
        </div>
      );
    case 'distributivo':
      return (
        <div className="flex flex-col gap-5">
          <BackButton onClick={() => go('medida')} />
          <ScreenTitle
            title={DISTRIBUTIVE_SCREEN.title}
            subtitle={DISTRIBUTIVE_SCREEN.subtitle}
            headingRef={headingRef}
          />
          <DataChips items={vtiChip(state)} />
          <Callout tone="gray" icon={<Info />} title={DISTRIBUTIVE_SCREEN.interpretation.title}>
            {DISTRIBUTIVE_SCREEN.interpretation.text}
          </Callout>
          {VTI_SHOCK_TYPE_CONTENT.distributivo.sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-1.5">
              <BlockTitle>{section.title}</BlockTitle>
              <ul className="list-disc pl-5 text-[0.9375rem] text-foreground">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <InfusionLinks drugs={VTI_SHOCK_TYPE_CONTENT.distributivo.infusions} />
          <Button
            type="button"
            className="self-start"
            onClick={() => dispatch({ type: 'ver-resumo' })}
          >
            Ver resumo
          </Button>
        </div>
      );
    case 'resultado': {
      const content = state.shockType ? VTI_SHOCK_TYPE_CONTENT[state.shockType] : null;
      return (
        <div className="flex flex-col gap-5">
          <BackButton onClick={() => go('inicio')} label="Início" />
          <ScreenTitle
            title="Resultado da classificação"
            subtitle="Algoritmo baseado no VTI"
            headingRef={headingRef}
          />
          <DataChips items={vtiChip(state)} />
          {content ? (
            <ToneResult tone={content.tone} title={content.label} live={false}>
              <p>{content.summary.subtitle}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {content.summary.lines.map((line) => (
                  <li key={line.label}>
                    <span className="font-semibold">{line.label}:</span> {line.text}
                  </li>
                ))}
              </ul>
            </ToneResult>
          ) : null}
          <InfusionLinks drugs={VTI_RESULT_INFUSIONS} />
          <p className="text-xs text-muted-foreground">Referência: {MERCADAL}</p>
          <div className="flex flex-wrap gap-2">
            <CopyToChartButton text={buildVtiChartNote(state, MERCADAL)} />
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: 'reiniciar' })}>
              <ArrowCounterClockwise aria-hidden="true" />
              Reiniciar VTI
            </Button>
          </div>
        </div>
      );
    }
  }
}
