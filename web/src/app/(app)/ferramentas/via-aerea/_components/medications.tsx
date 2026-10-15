'use client';

import { NOTICES, POPULATIONS } from '@clinical-tools/airway/content';
import { AIRWAY_DRUG_CATEGORIES } from '@clinical-tools/airway/drugs';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Block, NoticeCallout } from './airway-parts';
import { DoseCard } from './dose-card';
import type { StepProps } from './step-props';

/**
 * Medicações da intubação (passo 8 e a tela avulsa "Doses de medicações"):
 * peso comum às ferramentas, aviso de redução em instável ou idoso e os
 * cartões por categoria (simpatolítico opcional, 1 indutor, 1 BNM).
 */
export function Medications({ state, view, dispatch, weight, onWeightChange }: StepProps) {
  const population = POPULATIONS.find(({ id }) => id === state.population)?.label;
  return (
    <div className="flex flex-col gap-5">
      {view.doseReduction ? <NoticeCallout notice={NOTICES.reducaoDose} /> : null}

      <div className="flex flex-col gap-1.5">
        <WeightField
          id="via-aerea-peso-medicacoes"
          population="adulto"
          value={weight}
          onValueChange={onWeightChange}
        />
        <p className="text-xs text-muted-foreground">
          População: {population}. Toque no cartão para selecionar: 1 indutor + 1 BNM (bloqueio
          simpático opcional).
        </p>
      </div>

      {AIRWAY_DRUG_CATEGORIES.map((category) => (
        <Block key={category.id} title={category.label}>
          <ul className="flex flex-col gap-2">
            {view.drugs
              .filter(({ drug }) => drug.category === category.id)
              .map((drugView) => (
                <DoseCard
                  key={drugView.drug.id}
                  view={drugView}
                  onToggle={() => dispatch({ type: 'toggle-drug', drug: drugView.drug.id })}
                  onRateChange={(rate) =>
                    dispatch({ type: 'set-drug-rate', drug: drugView.drug.id, rate })
                  }
                />
              ))}
          </ul>
        </Block>
      ))}
    </div>
  );
}
