'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowClockwise, Copy, Trash, UserPlus, UsersThree } from '@phosphor-icons/react';
import {
  BETA_INVITE_LIMITS,
  type BetaInviteView,
  type BetaWaitlistEntryView,
  type BetaWaitlistStatus,
} from '@contracts/beta';
import { ApiError } from '@/lib/api-client';
import {
  inviteLink,
  useApproveBetaWaitlist,
  useBetaWaitlist,
  useDeleteBetaWaitlistEntry,
} from '@/lib/beta-queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/domain/empty-state';
import { copyText } from '../../_lib/gold-case';
import {
  INVITE_STATUS_TAG,
  StatusTag,
  WAITLIST_STATUS_TAG,
  formatShortDate,
  profileSummary,
} from './beta-labels';

type Filter = BetaWaitlistStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'waiting', label: 'Aguardando' },
  { value: 'invited', label: 'Convidados' },
  { value: 'registered', label: 'Cadastrados' },
  { value: 'all', label: 'Todos' },
];

async function copyLink(code: string) {
  if (await copyText(inviteLink(code))) toast.success('Link do convite copiado.');
  else toast.error('Não foi possível copiar. Selecione e copie manualmente.');
}

/** Aprovar gera um convite de uso único; o resultado fica na tela para copiar. */
function ApproveDialog({
  entry,
  onClose,
}: {
  entry: BetaWaitlistEntryView | null;
  onClose: () => void;
}) {
  const approve = useApproveBetaWaitlist();
  const [batchLabel, setBatchLabel] = useState<string>(
    BETA_INVITE_LIMITS.waitlistBatchLabelDefault,
  );
  const [validDays, setValidDays] = useState(String(BETA_INVITE_LIMITS.waitlistValidDaysDefault));
  const [invite, setInvite] = useState<BetaInviteView | null>(null);

  function close() {
    setInvite(null);
    approve.reset();
    onClose();
  }

  function submit() {
    if (!entry) return;
    const days = Number.parseInt(validDays, 10);
    approve.mutate(
      {
        id: entry.id,
        body: {
          batchLabel: batchLabel.trim() || undefined,
          validDays: Number.isFinite(days) ? days : undefined,
        },
      },
      { onSuccess: (result) => setInvite(result.invite) },
    );
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{invite ? 'Convite gerado' : 'Aprovar e gerar convite'}</DialogTitle>
          <DialogDescription>
            {invite
              ? `Copie o link e mande para ${entry?.email}. O sistema não envia e-mail.`
              : `Convite de uso único para ${entry?.email}.`}
          </DialogDescription>
        </DialogHeader>
        {invite ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-tone-gray-bg px-3 py-2.5">
            <span className="font-mono text-sm font-medium tabular-nums">{invite.code}</span>
            <Button variant="outline" size="sm" onClick={() => void copyLink(invite.code)}>
              <Copy aria-hidden="true" />
              Copiar link
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-batch">Lote / origem</Label>
              <Input
                id="approve-batch"
                value={batchLabel}
                maxLength={BETA_INVITE_LIMITS.batchLabelMaxChars}
                onChange={(e) => setBatchLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-days">Validade (dias)</Label>
              <Input
                id="approve-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={BETA_INVITE_LIMITS.validDaysMax}
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
              />
            </div>
            {approve.isError && (
              <p role="alert" className="col-span-2 text-xs text-destructive">
                {approve.error instanceof ApiError
                  ? approve.error.message
                  : 'Não foi possível gerar o convite.'}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {invite ? (
            <Button onClick={close}>Concluir</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button loading={approve.isPending} onClick={submit}>
                Gerar convite
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Apagar atende o pedido da pessoa (LGPD): some o e-mail e o perfil. */
function DeleteDialog({
  entry,
  onClose,
}: {
  entry: BetaWaitlistEntryView | null;
  onClose: () => void;
}) {
  const remove = useDeleteBetaWaitlistEntry();
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apagar da lista de espera?</DialogTitle>
          <DialogDescription>
            Use quando a pessoa pedir. O e-mail {entry?.email} e o perfil são apagados; a trilha de
            auditoria guarda só que houve a exclusão. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() =>
              entry &&
              remove.mutate(entry.id, {
                onSuccess: () => {
                  toast.success('Apagado da lista de espera.');
                  onClose();
                },
                onError: (err) =>
                  toast.error(err instanceof ApiError ? err.message : 'Não foi possível apagar.'),
              })
            }
          >
            Apagar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryRow({
  entry,
  onApprove,
  onDelete,
}: {
  entry: BetaWaitlistEntryView;
  onApprove: (entry: BetaWaitlistEntryView) => void;
  onDelete: (entry: BetaWaitlistEntryView) => void;
}) {
  const summary = profileSummary(entry.profile);
  return (
    <li className="flex flex-col gap-1.5 px-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{entry.email}</span>
        <StatusTag tag={WAITLIST_STATUS_TAG[entry.status]} />
        <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
          desde {formatShortDate(entry.createdAt)}
        </span>
        <div className="flex gap-1 sm:ml-auto">
          {entry.status !== 'registered' && (
            <Button variant="ghost" size="sm" onClick={() => onApprove(entry)}>
              <UserPlus aria-hidden="true" />
              {entry.status === 'invited' ? 'Novo convite' : 'Aprovar'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onDelete(entry)}>
            <Trash aria-hidden="true" />
            Apagar
          </Button>
        </div>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">{summary || 'Sem perfil informado'}</p>
      {entry.invite && (
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <span>
            Convite <span className="font-mono text-foreground">{entry.invite.code}</span>
          </span>
          <StatusTag tag={INVITE_STATUS_TAG[entry.invite.status]} />
          {entry.invite.status === 'active' && (
            <Button variant="link" size="xs" onClick={() => void copyLink(entry.invite!.code)}>
              Copiar link
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function WaitlistPanel() {
  const [filter, setFilter] = useState<Filter>('waiting');
  const query = useBetaWaitlist(filter);
  const [approving, setApproving] = useState<BetaWaitlistEntryView | null>(null);
  const [deleting, setDeleting] = useState<BetaWaitlistEntryView | null>(null);
  const entries = query.data?.entries ?? [];
  const counts = query.data?.counts;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 border-b border-border">
        <Tabs
          value={filter}
          onValueChange={(value) => {
            const next = FILTERS.find((f) => f.value === value);
            if (next) setFilter(next.value);
          }}
          className="gap-0"
        >
          <TabsList aria-label="Filtrar a lista de espera" className="border-b-0">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
                {f.value !== 'all' && counts && counts[f.value] > 0 && (
                  <span className="ml-0.5 text-xs text-muted-foreground tabular-nums">
                    {counts[f.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Atualizar lista de espera"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <ArrowClockwise aria-hidden="true" />
        </Button>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <span className="sr-only">Carregando a lista de espera…</span>
        </div>
      ) : query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar a lista de espera</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      ) : entries.length === 0 ? (
        <div className="border-b border-border">
          <EmptyState
            icon={<UsersThree weight="duotone" />}
            title={filter === 'waiting' ? 'Ninguém aguardando' : 'Ninguém aqui'}
            description="Com BETA_INVITE_REQUIRED ligada, quem chega ao cadastro sem convite entra nesta lista."
          />
        </div>
      ) : (
        <ul
          aria-label="Lista de espera do beta"
          className="divide-y divide-border border-b border-border"
        >
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onApprove={setApproving}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}

      <ApproveDialog
        key={approving?.id ?? 'none'}
        entry={approving}
        onClose={() => setApproving(null)}
      />
      <DeleteDialog entry={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
