'use client';

import { FloppyDisk, SealCheck, Signature, Warning } from '@phosphor-icons/react';
import type { Physician } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DEFAULT_UNCERTAINTY =
  'O copiloto indicou evidência insuficiente para este caso. Ao confirmar, você declara que revisou o documento e assume responsabilidade pelo conteúdo.';

function friendlyError(message: string): string {
  return message.includes('already confirmed') ? 'Este documento já foi confirmado.' : message;
}

/**
 * Diálogo único de confirmação/assinatura de documento, usado na lista de
 * documentos e no editor. "Assumir este documento" é o texto que o e2e
 * (e2e/medico.spec.ts) procura — não renomear sem atualizar o teste.
 */
export function ConfirmDocumentDialog({
  open,
  onOpenChange,
  documentLabel,
  physician,
  uncertain = false,
  uncertaintyReason,
  hasUnsavedEdits = false,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo do tipo (ex.: "SOAP"). */
  documentLabel: string;
  physician: Physician | null;
  uncertain?: boolean;
  uncertaintyReason?: string | null;
  /** No editor: há edições locais que serão salvas antes de assinar. */
  hasUnsavedEdits?: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Não deixa fechar no meio da assinatura (Esc/clique fora).
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar e assinar {documentLabel}</DialogTitle>
          <DialogDescription>
            Ao confirmar, você assume este documento como conteúdo próprio. Ele é bloqueado para
            edição, assinado com hash SHA-256 e registrado na trilha de auditoria.{' '}
            <span className="font-medium text-foreground">Esta ação é irreversível.</span>
          </DialogDescription>
        </DialogHeader>

        {physician && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <Signature className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Dr(a). {physician.name ?? '—'}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                CRM {physician.crmUf}-{physician.crmNumber}
              </p>
            </div>
            {!physician.crmVerified && <Badge variant="warning">CRM pendente de verificação</Badge>}
          </div>
        )}

        {/* Aviso de incerteza dentro do dialog de confirmação — CLIN-001 */}
        {uncertain && (
          <Alert variant="warning">
            <Warning weight="fill" />
            <AlertTitle>Atenção: análise com incerteza</AlertTitle>
            <AlertDescription>{uncertaintyReason ?? DEFAULT_UNCERTAINTY}</AlertDescription>
          </Alert>
        )}

        {hasUnsavedEdits && (
          <p className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground">
            <FloppyDisk className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Suas alterações ainda não salvas serão salvas antes da assinatura.
          </p>
        )}

        <p className="text-xs text-pretty text-muted-foreground">
          Ao assinar você declara que revisou o conteúdo e assume a responsabilidade clínica. A IA é
          assistiva (Resolução CFM 2.314/2022). O texto e o hash ficam gravados de forma imutável.
        </p>

        {error && (
          <Alert variant="destructive">
            <Warning weight="fill" />
            <AlertDescription>{friendlyError(error)}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} loading={pending}>
            <SealCheck weight="fill" />
            Assumir este documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
