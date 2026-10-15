'use client';

import { useRef, useState } from 'react';
import { ETCO2_RANGE, RHYTHM_CHECK_TEXT } from '@clinical-tools/acls/content';
import { selectCycle, type AclsRhythmCheckResult } from '@clinical-tools/acls/session';
import { validateNumber } from '@clinical-tools/ranges';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NumericField } from '../numeric-field';
import { useAclsSession } from './acls-session-provider';

/**
 * Checagem de ritmo no fim de cada ciclo de 2 min (CC-313). Como no ANY, não
 * fecha sem resposta: o ciclo seguinte só começa com o ritmo registrado. O
 * óbito pede confirmação — encerra a parada e não tem volta.
 */
export function RhythmCheckDialog() {
  const { state, now, checkRhythm } = useAclsSession();
  const cycle = selectCycle(state, now);
  const open = cycle.phase === 'awaiting-rhythm-check';
  return (
    <Dialog open={open}>
      {open ? <RhythmCheckBody cycle={cycle.number} onAnswer={checkRhythm} /> : null}
    </Dialog>
  );
}

function RhythmCheckBody({
  cycle,
  onAnswer,
}: {
  cycle: number;
  onAnswer: (result: AclsRhythmCheckResult, etco2?: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [etco2, setEtco2] = useState('');
  const [confirmingDeath, setConfirmingDeath] = useState(false);
  const parsed = etco2.trim() === '' ? null : validateNumber(etco2, ETCO2_RANGE);
  const invalid = parsed !== null && !parsed.ok;

  function answer(result: AclsRhythmCheckResult) {
    if (invalid) return;
    onAnswer(result, parsed?.ok ? parsed.value : undefined);
  }

  return (
    <DialogContent
      ref={contentRef}
      showCloseButton={false}
      // O foco vai para a caixa, não para o ETCO2: no celular o teclado
      // subiria por cima dos botões de ritmo, que são a resposta principal.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        contentRef.current?.focus();
      }}
      onEscapeKeyDown={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => event.preventDefault()}
      onInteractOutside={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>
          {RHYTHM_CHECK_TEXT.title} · fim do ciclo {cycle}
        </DialogTitle>
        <DialogDescription>{RHYTHM_CHECK_TEXT.hint}</DialogDescription>
      </DialogHeader>

      <NumericField
        label="ETCO2 (opcional)"
        unit={ETCO2_RANGE.unit}
        range={ETCO2_RANGE}
        value={etco2}
        onValueChange={setEtco2}
      />

      {confirmingDeath ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground">Encerrar a parada por óbito?</p>
          <Button
            type="button"
            variant="destructive"
            disabled={invalid}
            onClick={() => answer('death')}
            className="min-h-12"
          >
            Confirmar óbito
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmingDeath(false)}
            className="min-h-12"
          >
            Voltar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled={invalid}
            onClick={() => answer('shockable')}
            className="min-h-12"
          >
            Chocável — choque
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={invalid}
            onClick={() => answer('nonshockable')}
            className="min-h-12"
          >
            Não chocável
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={invalid}
            onClick={() => answer('rosc')}
            className="min-h-12"
          >
            RCE (pulso presente)
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={invalid}
            onClick={() => setConfirmingDeath(true)}
            className="min-h-12"
          >
            Óbito
          </Button>
        </div>
      )}
    </DialogContent>
  );
}
