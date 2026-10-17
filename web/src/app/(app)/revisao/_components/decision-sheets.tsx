'use client';

import { useState, type FormEvent } from 'react';
import { Check, Handshake, SealCheck, XCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DEFAULT_VALIDITY_MONTHS, REJECT_REASONS, VALIDITY_OPTIONS } from '../_lib/card-labels';

const REVIEW_TEXT_MAX_CHARS = 2000;
const MIN_REASON_CHARS = 3;

function ChoiceChip({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
        checked
          ? 'border-primary bg-tone-blue-bg font-medium text-foreground'
          : 'border-border text-foreground hover:bg-hover',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {checked && <Check className="size-3.5 text-primary" weight="bold" aria-hidden="true" />}
      {children}
    </label>
  );
}

/**
 * Aprovar: o revisor assina a versão com o CRM dele e escolhe por quanto
 * tempo a aprovação vale (padrão 12 meses). Vencida, o cartão volta a
 * "revisar" (ADR-019).
 */
export function ApproveSheet({
  open,
  onOpenChange,
  version,
  signer,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: number;
  /** "Dra. Ana · CRM-SP 123456". */
  signer: string;
  pending: boolean;
  onConfirm: (input: { validityMonths: number; comment?: string }) => void;
}) {
  const [validityMonths, setValidityMonths] = useState<number>(DEFAULT_VALIDITY_MONTHS);
  const [comment, setComment] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = comment.trim();
    onConfirm({ validityMonths, ...(trimmed ? { comment: trimmed } : {}) });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full max-w-xl gap-0 overflow-y-auto rounded-t-xl p-0"
      >
        <form onSubmit={handleSubmit}>
          <SheetHeader className="pr-12">
            <SheetTitle>Aprovar a versão {version}</SheetTitle>
            <SheetDescription>
              Você assina como {signer}. A versão passa a ser a publicada e libera a dose.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
                Validade da aprovação
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VALIDITY_OPTIONS.map((months) => (
                  <ChoiceChip
                    key={months}
                    name="validity"
                    value={String(months)}
                    checked={validityMonths === months}
                    onSelect={() => setValidityMonths(months)}
                  >
                    {`${months} meses`}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-comment">Comentário (opcional)</Label>
              <Textarea
                id="approve-comment"
                value={comment}
                rows={2}
                maxLength={REVIEW_TEXT_MAX_CHARS}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Voltar ao cartão
            </Button>
            <Button type="submit" className="flex-1" loading={pending}>
              <SealCheck weight="bold" aria-hidden="true" />
              Aprovar e publicar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Descartar com motivo. Sem versão publicada, o cartão é arquivado; numa
 * correção de cartão publicado, só a correção cai e a versão assinada segue.
 */
export function RejectSheet({
  open,
  onOpenChange,
  version,
  correctsPublished,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: number;
  correctsPublished: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = reason.trim().length < MIN_REASON_CHARS;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (tooShort) return;
    onConfirm(reason.trim());
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full max-w-xl gap-0 overflow-y-auto rounded-t-xl p-0"
      >
        <form onSubmit={handleSubmit} noValidate>
          <SheetHeader className="pr-12">
            <SheetTitle>
              {correctsPublished
                ? `Descartar a correção (versão ${version})`
                : 'Descartar o cartão'}
            </SheetTitle>
            <SheetDescription>
              {correctsPublished
                ? 'A versão publicada continua valendo.'
                : 'O cartão é arquivado e não volta à fila.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
                Motivo frequente
              </legend>
              <div className="flex flex-wrap gap-2">
                {REJECT_REASONS.map((preset) => (
                  <ChoiceChip
                    key={preset}
                    name="reject-reason"
                    value={preset}
                    checked={reason === preset}
                    onSelect={() => setReason(preset)}
                  >
                    {preset}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-reason">Motivo</Label>
              <Textarea
                id="reject-reason"
                value={reason}
                rows={3}
                maxLength={REVIEW_TEXT_MAX_CHARS}
                required
                aria-invalid={touched && tooShort ? true : undefined}
                aria-describedby="reject-reason-help"
                onChange={(event) => setReason(event.target.value)}
              />
              <p
                id="reject-reason-help"
                className={cn(
                  'text-xs',
                  touched && tooShort ? 'text-tone-red' : 'text-muted-foreground',
                )}
              >
                {touched && tooShort
                  ? 'Escreva o motivo do descarte.'
                  : 'Obrigatório. Dados pessoais são mascarados ao salvar.'}
              </p>
            </div>
          </div>
          <SheetFooter className="flex-row gap-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Voltar ao cartão
            </Button>
            <Button type="submit" variant="destructive" className="flex-1" loading={pending}>
              <XCircle weight="bold" aria-hidden="true" />
              Descartar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * CC-411 — concordar com a versão sorteada: o cartão segue no ar e a
 * concordância entra na taxa. Comentário opcional.
 */
export function AgreeSheet({
  open,
  onOpenChange,
  version,
  firstReviewer,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: number;
  firstReviewer: string;
  pending: boolean;
  onConfirm: (comment?: string) => void;
}) {
  const [comment, setComment] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(comment.trim() || undefined);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full max-w-xl gap-0 overflow-y-auto rounded-t-xl p-0"
      >
        <form onSubmit={handleSubmit}>
          <SheetHeader className="pr-12">
            <SheetTitle>Concordar com a versão {version}</SheetTitle>
            <SheetDescription>
              Você confirma a aprovação de {firstReviewer}. O cartão continua no ar.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1.5 px-4 pb-2">
            <Label htmlFor="agree-comment">Comentário (opcional)</Label>
            <Textarea
              id="agree-comment"
              value={comment}
              rows={2}
              maxLength={REVIEW_TEXT_MAX_CHARS}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
          <SheetFooter className="flex-row gap-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Voltar ao cartão
            </Button>
            <Button type="submit" className="flex-1" loading={pending}>
              <Handshake weight="bold" aria-hidden="true" />
              Concordo
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
