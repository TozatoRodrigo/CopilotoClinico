'use client';

import { TEP_CALCULATORS } from '@clinical-tools/tep/calculators';
import { CalculatorView } from '@/components/domain/clinical-tools/calculator-view';
import { Disclosure } from '@/components/ui/disclosure';

/**
 * Aba Calculadoras do TEP: as nove do ANY, avulsas, cada uma com a tela
 * completa (resultado, copiar para o prontuário, referência). O PERC é o
 * mesmo da lista de calculadoras.
 */
export function TepCalculators() {
  return (
    <div className="flex flex-col divide-y divide-border">
      {TEP_CALCULATORS.map((definition) => (
        <Disclosure
          key={definition.id}
          title={
            <span className="flex flex-col">
              <span>{definition.name}</span>
              <span className="text-[0.8125rem] font-normal text-muted-foreground">
                {definition.description}
              </span>
            </span>
          }
          className="py-1"
          triggerClassName="min-h-12"
        >
          <CalculatorView definition={definition} className="pt-2" />
        </Disclosure>
      ))}
    </div>
  );
}
