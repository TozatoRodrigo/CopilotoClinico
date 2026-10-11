'use client';

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowsClockwise,
  CircleNotch,
  PencilSimple,
  Sparkle,
  WarningCircle,
  WarningOctagon,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Textarea } from '@/components/ui/textarea';
import type { Messages } from '@/lib/messages';
import { useMessages } from '@/lib/messages/use-messages';
import type { CaseUnderstanding } from '@/lib/types';
import { cn } from '@/lib/utils';

type UnderstandingMessages = Messages['understanding'];

export interface UnderstandingCorrection {
  /** Envia a correção pela reanálise; `true` quando foi aceita (ou enfileirada sem conexão). */
  onSubmit: (correction: string) => Promise<boolean>;
  submitting: boolean;
}

interface UnderstandingCardProps {
  /** Ausente (legacy, interação antiga) ou `null` (a etapa falhou): o card não aparece. */
  understanding: CaseUnderstanding | null | undefined;
  /** Sem correção durante o streaming e quando acabaram as rodadas de reanálise. */
  correction?: UnderstandingCorrection;
  /** Linha de rodapé, ex.: "Montando o plano…" na captura. */
  footnote?: string;
  className?: string;
}

const CHIP_CLASS = 'h-auto min-h-5 max-w-full whitespace-normal py-0.5 text-left leading-snug';

/** Só o que o caso informou; o backend nunca preenche dado não dito (ver Etapa 1). */
function structuredDataChips(
  data: CaseUnderstanding['structuredData'],
  copy: UnderstandingMessages['data'],
): string[] {
  const { vitals } = data;
  const hasBloodPressure = vitals.systolicBp !== null || vitals.diastolicBp !== null;
  const chips = [
    data.age !== null ? copy.age(data.age) : null,
    data.sex ? copy.sex[data.sex] : null,
    data.onset ? copy.onset(data.onset) : null,
    hasBloodPressure ? copy.bloodPressure(vitals.systolicBp, vitals.diastolicBp) : null,
    vitals.heartRate !== null ? copy.heartRate(vitals.heartRate) : null,
    vitals.respiratoryRate !== null ? copy.respiratoryRate(vitals.respiratoryRate) : null,
    vitals.spo2 !== null ? copy.spo2(vitals.spo2) : null,
    vitals.temperature !== null ? copy.temperature(vitals.temperature) : null,
    vitals.glucose !== null ? copy.glucose(vitals.glucose) : null,
    ...data.keyFindings,
    ...data.relevantContext,
  ];
  return chips.filter((chip): chip is string => chip !== null);
}

/**
 * F1 — "O que eu entendi" (ADR-013, Etapa 1): o que o copiloto entendeu do
 * caso ANTES de buscar evidência — síndrome, instabilidade, hipóteses que não
 * podem passar e o que falta saber. Vem antes do plano para o médico conferir
 * em segundos se o caso foi entendido e corrigir o que não foi.
 *
 * Cores com significado clínico fixo (docs/design-tokens.md): vermelho para
 * ameaça imediata e "não pode perder", laranja só para o dado que muda a
 * conduta, azul para o que é da IA, cinza para os dados do caso.
 */
export function UnderstandingCard({
  understanding,
  correction,
  footnote,
  className,
}: UnderstandingCardProps) {
  const messages = useMessages();
  const idPrefix = useId();
  if (!understanding) return null;

  // Cada lista leva o nome do seu título para o leitor de tela.
  const ids = {
    heading: `${idPrefix}-heading`,
    data: `${idPrefix}-data`,
    cannotMiss: `${idPrefix}-cannot-miss`,
    likely: `${idPrefix}-likely`,
    missing: `${idPrefix}-missing`,
  };

  const copy = messages.understanding;
  const chips = structuredDataChips(understanding.structuredData, copy.data);
  const { instability, cannotMiss, likely, missingDiscriminators } = understanding;

  return (
    <section
      aria-labelledby={ids.heading}
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border px-4 py-4 sm:px-5',
        className,
      )}
    >
      <div className="space-y-0.5">
        <h2
          id={ids.heading}
          className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-foreground"
        >
          <Sparkle className="size-4 text-tone-blue" weight="fill" aria-hidden="true" />
          {copy.heading}
        </h2>
        <p className="text-[0.8125rem] text-pretty text-muted-foreground">{copy.description}</p>
      </div>

      <p className="text-[0.9375rem] leading-relaxed text-pretty text-foreground">
        {understanding.problemRepresentation}
      </p>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">{copy.syndrome}</span>
        <Badge variant="blue">{copy.syndromes[understanding.syndrome]}</Badge>
        {understanding.syndromeNote && (
          <span className="text-foreground">{understanding.syndromeNote}</span>
        )}
      </p>

      {instability.present && (
        <Callout tone="red" icon={<WarningOctagon weight="fill" />} title={copy.instabilityTitle}>
          <ul className="list-disc space-y-0.5 pl-4">
            {instability.findings.map((finding, index) => (
              <li key={`${finding}-${index}`}>{finding}</li>
            ))}
          </ul>
        </Callout>
      )}

      {chips.length > 0 && (
        <div className="space-y-1.5">
          <h3 id={ids.data} className="text-[0.8125rem] font-medium text-muted-foreground">
            {copy.data.heading}
          </h3>
          <ul aria-labelledby={ids.data} className="flex flex-wrap gap-1.5">
            {chips.map((chip, index) => (
              <li key={`${chip}-${index}`} className="max-w-full">
                <Badge variant="secondary" className={CHIP_CLASS}>
                  {chip}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cannotMiss.length > 0 && (
        <div className="space-y-2">
          <h3
            id={ids.cannotMiss}
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <WarningOctagon className="size-4 text-tone-red" weight="fill" aria-hidden="true" />
            {copy.cannotMissHeading}
          </h3>
          {/* Do pior para o menos grave: a ordem é informação clínica. */}
          <ol aria-labelledby={ids.cannotMiss} className="flex flex-col gap-2.5">
            {cannotMiss.map((item, index) => (
              <li key={`${item.hypothesis}-${index}`} className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{item.hypothesis}</p>
                <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
                  {item.whyPlausible}
                </p>
                <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
                  <span className="text-foreground">{copy.confirmOrRuleOut}</span>{' '}
                  {item.confirmOrRuleOut}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {likely.length > 0 && (
        <div className="space-y-1.5">
          <h3 id={ids.likely} className="text-sm font-semibold text-foreground">
            {copy.likelyHeading}
          </h3>
          <ul aria-labelledby={ids.likely} className="flex flex-col gap-1">
            {likely.map((item, index) => (
              <li key={`${item.hypothesis}-${index}`} className="text-sm text-pretty">
                <span className="font-medium text-foreground">{item.hypothesis}</span>
                <span className="text-muted-foreground"> — {item.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missingDiscriminators.length > 0 && (
        <div className="space-y-2">
          <h3
            id={ids.missing}
            className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <WarningCircle className="size-4 text-tone-orange" weight="fill" aria-hidden="true" />
            {copy.missingHeading}
            <Badge variant="warning">{messages.blocker.changesConduct}</Badge>
          </h3>
          <ol aria-labelledby={ids.missing} className="flex flex-col gap-2.5">
            {missingDiscriminators.map((item, index) => (
              <li key={`${item.data}-${index}`} className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{item.data}</p>
                <p className="text-[0.8125rem] text-pretty text-muted-foreground">
                  {copy.separates(item.separates)}
                </p>
                <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
                  {item.whyItChangesConduct}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {footnote && (
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
          {footnote}
        </p>
      )}

      {correction && <CorrectionForm correction={correction} copy={copy.correction} />}
    </section>
  );
}

/**
 * "Corrigir entendimento": o texto do médico vai pela reanálise de sempre
 * (POST /respond, questionId reservado) e o backend refaz o entendimento com
 * ele. O texto só é limpo quando a reanálise aceita; numa falha, o médico não
 * precisa digitar de novo.
 */
function CorrectionForm({
  correction,
  copy,
}: {
  correction: UnderstandingCorrection;
  copy: UnderstandingMessages['correction'];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const formId = useId();
  const fieldId = useId();
  const canSubmit = text.trim().length > 0 && !correction.submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const accepted = await correction.onSubmit(text);
    if (!accepted) return;
    setText('');
    setOpen(false);
  }

  function closeOnEscape(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && !correction.submitting) setOpen(false);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        aria-controls={open ? formId : undefined}
        disabled={correction.submitting}
        onClick={() => setOpen((current) => !current)}
      >
        <PencilSimple />
        {copy.cta}
      </Button>

      {open && (
        <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
            {copy.label}
          </label>
          <Textarea
            id={fieldId}
            autoFocus
            rows={3}
            value={text}
            placeholder={copy.placeholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={closeOnEscape}
            className="resize-y text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {correction.submitting ? (
                <CircleNotch className="animate-spin" weight="bold" />
              ) : (
                <ArrowsClockwise weight="bold" />
              )}
              {correction.submitting ? copy.submitting : copy.submit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={correction.submitting}
              onClick={() => setOpen(false)}
            >
              {copy.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
