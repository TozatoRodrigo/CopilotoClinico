'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ArrowClockwise, Copy, LinkSimple, Prohibit, Ticket } from '@phosphor-icons/react';
import type { BetaInviteView } from '@contracts/beta';
import { BETA_INVITE_LIMITS } from '@/lib/beta-contract';
import { ApiError } from '@/lib/api-client';
import {
  inviteLink,
  useBetaInvites,
  useCreateBetaInvites,
  useRevokeBetaInvite,
} from '@/lib/beta-queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain/empty-state';
import { SectionHeader } from '@/components/layout/page-header';
import { copyText } from '@/lib/clipboard';
import { INVITE_STATUS_TAG, StatusTag, formatShortDate } from './beta-labels';

interface BatchForm {
  batchLabel: string;
  quantity: string;
  maxUses: string;
  validDays: string;
}

const INITIAL_FORM: BatchForm = {
  batchLabel: '',
  quantity: '10',
  maxUses: '1',
  validDays: String(BETA_INVITE_LIMITS.validDaysDefault),
};

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Erro do formulário de lote, ou `null` se dá para enviar. */
function batchFormError(form: BatchForm): string | null {
  if (!form.batchLabel.trim()) return 'Informe o lote ou a origem (ex.: rede Ripardo).';
  const quantity = toInt(form.quantity);
  if (quantity < 1 || quantity > BETA_INVITE_LIMITS.quantityMax) {
    return `Quantidade entre 1 e ${BETA_INVITE_LIMITS.quantityMax}.`;
  }
  const maxUses = toInt(form.maxUses);
  if (maxUses < 1 || maxUses > BETA_INVITE_LIMITS.maxUsesMax) {
    return `Usos por código entre 1 e ${BETA_INVITE_LIMITS.maxUsesMax}.`;
  }
  const validDays = toInt(form.validDays);
  if (validDays < 1 || validDays > BETA_INVITE_LIMITS.validDaysMax) {
    return `Validade entre 1 e ${BETA_INVITE_LIMITS.validDaysMax} dias.`;
  }
  return null;
}

async function copyWithToast(text: string, success: string) {
  if (await copyText(text)) toast.success(success);
  else toast.error('Não foi possível copiar. Selecione e copie manualmente.');
}

function GenerateInvites({ knownBatches }: { knownBatches: string[] }) {
  const create = useCreateBetaInvites();
  const [form, setForm] = useState<BatchForm>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<BetaInviteView[]>([]);

  function update<K extends keyof BatchForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = batchFormError(form);
    if (problem) {
      setError(problem);
      return;
    }
    create.mutate(
      {
        batchLabel: form.batchLabel.trim(),
        quantity: toInt(form.quantity),
        maxUses: toInt(form.maxUses),
        validDays: toInt(form.validDays),
      },
      {
        onSuccess: ({ invites }) => {
          setCreated(invites);
          toast.success(
            invites.length === 1 ? 'Convite gerado.' : `${invites.length} convites gerados.`,
          );
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Não foi possível gerar os convites.'),
      },
    );
  }

  const links = created.map((invite) => inviteLink(invite.code)).join('\n');

  return (
    <section className="flex flex-col gap-3" aria-labelledby="beta-generate">
      <SectionHeader
        title={<span id="beta-generate">Gerar convites</span>}
        description="Um lote de códigos com a mesma origem, limite de usos e validade. O código não carrega dado pessoal."
      />
      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] sm:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="beta-batch-label">Lote / origem</Label>
          <Input
            id="beta-batch-label"
            list="beta-batch-labels"
            placeholder="rede Ripardo"
            maxLength={BETA_INVITE_LIMITS.batchLabelMaxChars}
            value={form.batchLabel}
            onChange={(e) => update('batchLabel', e.target.value)}
          />
          <datalist id="beta-batch-labels">
            {knownBatches.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="beta-quantity">Quantidade</Label>
          <Input
            id="beta-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={BETA_INVITE_LIMITS.quantityMax}
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="beta-max-uses">Usos por código</Label>
          <Input
            id="beta-max-uses"
            type="number"
            inputMode="numeric"
            min={1}
            max={BETA_INVITE_LIMITS.maxUsesMax}
            value={form.maxUses}
            onChange={(e) => update('maxUses', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="beta-valid-days">Validade (dias)</Label>
          <Input
            id="beta-valid-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={BETA_INVITE_LIMITS.validDaysMax}
            value={form.validDays}
            onChange={(e) => update('validDays', e.target.value)}
          />
        </div>
        <Button type="submit" loading={create.isPending}>
          <Ticket aria-hidden="true" />
          Gerar
        </Button>
        {error && (
          <p role="alert" className="text-xs text-destructive sm:col-span-5">
            {error}
          </p>
        )}
      </form>

      {created.length > 0 && (
        <Callout
          tone="green"
          title={
            created.length === 1 ? 'Convite pronto para enviar' : 'Convites prontos para enviar'
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void copyWithToast(
                  links,
                  created.length === 1 ? 'Link copiado.' : 'Links copiados, um por linha.',
                )
              }
            >
              <Copy aria-hidden="true" />
              {created.length === 1 ? 'Copiar link' : 'Copiar os links'}
            </Button>
          }
        >
          <p>O sistema não envia e-mail: copie e mande pelo seu canal.</p>
          <ul aria-label="Convites gerados" className="mt-1.5 flex flex-wrap gap-1.5">
            {created.map((invite) => (
              <li key={invite.id} className="font-mono text-[0.8125rem] tabular-nums">
                {invite.code}
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </section>
  );
}

function RevokeDialog({ invite, onClose }: { invite: BetaInviteView | null; onClose: () => void }) {
  const revoke = useRevokeBetaInvite();
  return (
    <Dialog open={invite !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revogar o convite {invite?.code}?</DialogTitle>
          <DialogDescription>
            Ninguém mais entra com este código. Quem já entrou continua no beta. Não dá para
            desfazer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={revoke.isPending}
            onClick={() =>
              invite &&
              revoke.mutate(invite.id, {
                onSuccess: () => {
                  toast.success('Convite revogado.');
                  onClose();
                },
                onError: (err) =>
                  toast.error(err instanceof ApiError ? err.message : 'Não foi possível revogar.'),
              })
            }
          >
            Revogar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteRow({
  invite,
  onRevoke,
}: {
  invite: BetaInviteView;
  onRevoke: (invite: BetaInviteView) => void;
}) {
  return (
    <li className="flex flex-col gap-1.5 px-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-sm font-medium text-foreground tabular-nums">
          {invite.code}
        </span>
        <Badge variant="gray">{invite.batchLabel}</Badge>
        <StatusTag tag={INVITE_STATUS_TAG[invite.status]} />
        {invite.fromWaitlist && <Badge variant="outline">lista de espera</Badge>}
        <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
          {invite.usesCount} de {invite.maxUses} {invite.maxUses === 1 ? 'uso' : 'usos'} · vence em{' '}
          {formatShortDate(invite.expiresAt)}
        </span>
        <div className="flex gap-1 sm:ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyWithToast(inviteLink(invite.code), 'Link copiado.')}
            disabled={invite.status !== 'active'}
          >
            <LinkSimple aria-hidden="true" />
            Copiar link
          </Button>
          {invite.status !== 'revoked' && (
            <Button variant="ghost" size="sm" onClick={() => onRevoke(invite)}>
              <Prohibit aria-hidden="true" />
              Revogar
            </Button>
          )}
        </div>
      </div>
      {invite.uses.length > 0 && (
        <ul aria-label={`Usos do convite ${invite.code}`} className="flex flex-col gap-0.5 pl-0.5">
          {invite.uses.map((use) => (
            <li key={use.physicianId} className="text-[0.8125rem] text-muted-foreground">
              {use.name ?? 'Sem nome'} · {use.email} · entrou em {formatShortDate(use.joinedAt)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function InvitesPanel() {
  const query = useBetaInvites();
  const [revoking, setRevoking] = useState<BetaInviteView | null>(null);
  const invites = query.data?.invites ?? [];
  const batches = query.data?.batches ?? [];

  return (
    <div className="flex flex-col gap-8">
      <GenerateInvites knownBatches={batches.map((batch) => batch.batchLabel)} />

      <section className="flex flex-col gap-3" aria-labelledby="beta-invites">
        <SectionHeader
          title={<span id="beta-invites">Convites</span>}
          description={
            batches.length > 0
              ? batches
                  .map(
                    (batch) =>
                      `${batch.batchLabel}: ${batch.invites} ${batch.invites === 1 ? 'código' : 'códigos'}, ${batch.uses} ${batch.uses === 1 ? 'cadastro' : 'cadastros'}`,
                  )
                  .join(' · ')
              : undefined
          }
          action={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Atualizar convites"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <ArrowClockwise aria-hidden="true" />
            </Button>
          }
        />
        {query.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <span className="sr-only">Carregando convites…</span>
          </div>
        ) : query.error ? (
          <Alert variant="destructive">
            <AlertTitle>Erro ao carregar os convites</AlertTitle>
            <AlertDescription>{query.error.message}</AlertDescription>
          </Alert>
        ) : invites.length === 0 ? (
          <div className="border-y border-border">
            <EmptyState
              icon={<Ticket weight="duotone" />}
              title="Nenhum convite ainda"
              description="Gere o primeiro lote acima."
            />
          </div>
        ) : (
          <ul
            aria-label="Convites do beta"
            className="divide-y divide-border border-y border-border"
          >
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onRevoke={setRevoking} />
            ))}
          </ul>
        )}
      </section>

      <RevokeDialog invite={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}
