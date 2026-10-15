'use client';

import { useCallback, useState } from 'react';
import {
  parseStoredCustomDilution,
  type CustomDilution,
} from '@clinical-tools/infusions/custom-dilution';
import type { InfusionDrug } from '@clinical-tools/infusions/drugs';

/**
 * "Minha diluição" (CC-311): o preparo do serviço, por droga, guardado no
 * aparelho (localStorage) e não no servidor — é preferência do médico, sem
 * dado de paciente. O motor confere o que for lido: valor fora da trava volta
 * a ser "sem diluição própria".
 */

export function customDilutionKey(drugId: string): string {
  return `copiloto:ferramentas:diluicao:${drugId}`;
}

export function readCustomDilution(drug: InfusionDrug): CustomDilution | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStoredCustomDilution(drug, window.localStorage.getItem(customDilutionKey(drug.id)));
  } catch {
    return null;
  }
}

/** Diluição salva de uma droga. Quem usa monta um painel por droga (`key={drug.id}`). */
export function useCustomDilution(drug: InfusionDrug) {
  const [saved, setSaved] = useState<CustomDilution | null>(() => readCustomDilution(drug));

  const save = useCallback(
    (dilution: CustomDilution) => {
      try {
        window.localStorage.setItem(
          customDilutionKey(drug.id),
          JSON.stringify({
            ampoules: dilution.ampoules,
            volume: dilution.volume,
            concentration: dilution.concentration,
          }),
        );
      } catch {
        /* storage cheio ou bloqueado: vale só nesta tela */
      }
      setSaved(dilution);
    },
    [drug.id],
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(customDilutionKey(drug.id));
    } catch {
      /* nada a fazer */
    }
    setSaved(null);
  }, [drug.id]);

  return { saved, save, clear };
}
