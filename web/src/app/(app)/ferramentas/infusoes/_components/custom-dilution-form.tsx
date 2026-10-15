'use client';

import { useState } from 'react';
import {
  checkCustomDilution,
  describePreparation,
  type CustomDilution,
} from '@clinical-tools/infusions/custom-dilution';
import { formatConcentration } from '@clinical-tools/infusions/dose';
import type { InfusionDrug } from '@clinical-tools/infusions/drugs';
import { formatCompact } from '@clinical-tools/numbers';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';

export interface CustomDilutionFormProps {
  drug: InfusionDrug;
  /** Preenche o formulário ao editar a diluição salva. */
  initial: CustomDilution | null;
  /** Aplica na tela (ainda sem salvar no aparelho). */
  onApply: (dilution: CustomDilution) => void;
  /** Salva no aparelho como a diluição desta droga. */
  onSave: (dilution: CustomDilution) => void;
  onClose: () => void;
}

/**
 * "Minha diluição" (CC-311), no fluxo do ANY: ampolas e volume final, prévia
 * por extenso para conferir contra a bolsa, trava de razão e de volume e, ao
 * confirmar, a pergunta se vira a diluição deste aparelho.
 */
export function CustomDilutionForm({
  drug,
  initial,
  onApply,
  onSave,
  onClose,
}: CustomDilutionFormProps) {
  const [ampoules, setAmpoules] = useState(initial ? formatCompact(initial.ampoules) : '');
  const [volume, setVolume] = useState(initial ? formatCompact(initial.volume) : '');
  const [applied, setApplied] = useState<CustomDilution | null>(null);
  const ampoule = drug.ampoule;
  if (!ampoule) return null;

  if (applied) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-primary px-3 py-3">
        <p className="text-sm text-foreground">
          Diluição aplicada. Tornar esta a minha diluição padrão neste aparelho?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Só desta vez
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(applied);
              onClose();
            }}
          >
            Sim, salvar
          </Button>
        </div>
      </div>
    );
  }

  const check = checkCustomDilution(drug, ampoules, volume);
  // Prévia sempre por extenso, mesmo quando a trava barra: é o que se confere contra a bolsa.
  const typed =
    check.status === 'valida' ? check.dilution : check.status === 'barrada' ? check : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border px-3 py-3">
      <p className="text-sm font-semibold text-foreground">Diluição do meu serviço</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumericField
          label={`Ampolas de ${ampoule.label}`}
          unit="amp."
          value={ampoules}
          onValueChange={setAmpoules}
          placeholder="5"
          hint=""
        />
        <NumericField
          label="Volume final"
          unit="mL"
          value={volume}
          onValueChange={setVolume}
          placeholder="250"
          hint=""
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2 text-center"
      >
        {typed === null ? (
          <span className="text-xs text-muted-foreground">
            {check.status === 'incompleta' ? check.message : null}
          </span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              {describePreparation(drug, typed.ampoules, typed.volume)}
            </span>
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatConcentration(typed.concentration)} {drug.concentrationUnit}
            </span>
          </>
        )}
        {check.status === 'barrada' ? (
          <span className="text-xs font-medium text-destructive">{check.message}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={check.status !== 'valida'}
          onClick={() => {
            if (check.status !== 'valida') return;
            onApply(check.dilution);
            setApplied(check.dilution);
          }}
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}
