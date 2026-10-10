'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  Check,
  Clock,
  MagnifyingGlass,
  SealCheck,
  SealWarning,
  ShieldCheck,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { useCrmVerifications, useResolveCrmVerification } from '@/lib/clinical-queries';
import type { CrmVerificationItem, CrmVerificationStatus } from '@/lib/types';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Tab = CrmVerificationStatus;

const TABS: { value: Tab; label: string; icon: Icon }[] = [
  { value: 'PENDING', label: 'Pendentes', icon: Clock },
  { value: 'APPROVED', label: 'Aprovadas', icon: SealCheck },
  { value: 'REJECTED', label: 'Rejeitadas', icon: SealWarning },
];

/** Tag de status — laranja pede ação, verde aprovado, vermelho rejeitado. */
const STATUS_TAG: Record<
  CrmVerificationStatus,
  { label: string; variant: 'warning' | 'success' | 'destructive'; icon: Icon }
> = {
  PENDING: { label: 'Pendente', variant: 'warning', icon: Clock },
  APPROVED: { label: 'Aprovado', variant: 'success', icon: SealCheck },
  REJECTED: { label: 'Rejeitado', variant: 'destructive', icon: SealWarning },
};

const EMPTY_COPY: Record<Tab, { title: string; description?: string }> = {
  PENDING: {
    title: 'Fila zerada',
    description: 'Não há solicitações de CRM aguardando análise no momento.',
  },
  APPROVED: { title: 'Nenhuma verificação aprovada' },
  REJECTED: { title: 'Nenhuma verificação rejeitada' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function physicianLabel(item: CrmVerificationItem): string {
  return item.physician.name ?? item.physician.email;
}

function matchesSearch(item: CrmVerificationItem, term: string): boolean {
  if (!term) return true;
  const haystack = [
    item.physician.name ?? '',
    item.physician.email,
    item.physician.crmUf,
    item.physician.crmNumber,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

/**
 * S25-CRM-01 — o motivo vive dentro do conteúdo do dialog, que o Radix
 * desmonta ao fechar: cada abertura começa com o campo vazio. Antes o texto
 * do motivo anterior "vazava" para o próximo item rejeitado, causando erro
 * de auditoria (motivo errado atribuído ao médico errado).
 */
function RejectForm({
  item,
  onCancel,
  onConfirm,
  loading,
}: {
  item: CrmVerificationItem | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <>
      <DialogHeader>
        <DialogTitle variant="brand">Rejeitar verificação CRM</DialogTitle>
        <DialogDescription>
          {item && (
            <>
              Médico: <strong className="font-medium text-foreground">{physicianLabel(item)}</strong> — CRM{' '}
              {item.physician.crmUf} {item.physician.crmNumber}
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="reject-reason">
          Motivo da rejeição <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: CRM não encontrado no conselho, UF incorreta, número inválido..."
          rows={3}
          // S25-GUIDE-01 — autoFocus removido (rouba teclado no mobile).
        />
        <p className="text-xs text-muted-foreground">
          O motivo será exibido para o médico e registrado na trilha de auditoria.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={!reason.trim() || loading}
          onClick={() => onConfirm(reason.trim())}
        >
          {loading ? 'Rejeitando...' : 'Confirmar rejeição'}
        </Button>
      </DialogFooter>
    </>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CrmVerificationItem | null;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* key: trocar de médico com o dialog aberto também zera o motivo. */}
        <RejectForm
          key={item?.id ?? 'none'}
          item={item}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}

function StatusTag({ status }: { status: CrmVerificationStatus }) {
  const tag = STATUS_TAG[status];
  const TagIcon = tag.icon;
  return (
    <Badge variant={tag.variant}>
      <TagIcon weight="bold" aria-hidden="true" />
      {tag.label}
    </Badge>
  );
}

/**
 * S22-DS-01 — uma única árvore DOM por linha: `<tr>` de tabela no desktop e
 * bloco empilhado no mobile (< sm), só com CSS. Evita duplicar o texto da
 * linha (o e2e procura o e-mail do médico por texto) e mantém um único alvo
 * de foco por ação.
 */
const mobileCell =
  'max-sm:block max-sm:h-auto max-sm:border-0 max-sm:p-0 max-sm:[&:not(:last-child)]:border-r-0';

function VerificationRow({
  item,
  isPending,
  onApprove,
  onReject,
}: {
  item: CrmVerificationItem;
  isPending: boolean;
  onApprove: (item: CrmVerificationItem) => void;
  onReject: (item: CrmVerificationItem) => void;
}) {
  const nameId = `crm-${item.id}-physician`;
  return (
    <TableRow className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:px-1 max-sm:py-3">
      <TableCell className={cn(mobileCell, 'py-2 max-sm:col-start-1 max-sm:row-start-1')}>
        <p id={nameId} className="truncate font-medium text-foreground">
          {item.physician.name ?? 'Sem nome'}
        </p>
        <p className="truncate text-[0.8125rem] text-muted-foreground">{item.physician.email}</p>
      </TableCell>
      <TableCell className={cn(mobileCell, 'max-sm:hidden')}>
        <Badge variant="gray">{item.physician.crmUf}</Badge>
      </TableCell>
      <TableCell
        className={cn(
          mobileCell,
          'font-mono text-[0.8125rem] tabular-nums max-sm:col-span-2 max-sm:text-muted-foreground',
        )}
      >
        <span className="sm:hidden">CRM-{item.physician.crmUf} </span>
        {item.physician.crmNumber}
      </TableCell>
      <TableCell
        className={cn(
          mobileCell,
          'text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular-nums max-sm:col-span-2',
        )}
      >
        <span className="sm:hidden">Solicitado em </span>
        {formatDate(item.requestedAt)}
      </TableCell>
      {!isPending && (
        <TableCell
          className={cn(
            mobileCell,
            'text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular-nums max-sm:col-span-2',
          )}
        >
          <span className="sm:hidden">Resolvido em </span>
          {item.resolvedAt ? formatDate(item.resolvedAt) : '—'}
        </TableCell>
      )}
      <TableCell className={cn(mobileCell, 'max-sm:col-start-2 max-sm:row-start-1')}>
        <StatusTag status={item.status} />
      </TableCell>
      {isPending ? (
        <TableCell className={cn(mobileCell, 'max-sm:col-span-2 max-sm:pt-1.5')}>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="max-sm:h-10 max-sm:flex-1"
              aria-describedby={nameId}
              onClick={() => onApprove(item)}
            >
              <Check weight="bold" aria-hidden="true" />
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="max-sm:h-10 max-sm:flex-1"
              aria-describedby={nameId}
              onClick={() => onReject(item)}
            >
              <X weight="bold" aria-hidden="true" />
              Rejeitar
            </Button>
          </div>
        </TableCell>
      ) : (
        <TableCell className={cn(mobileCell, 'max-w-[18rem] max-sm:col-span-2 max-sm:max-w-none')}>
          {item.notes ? (
            <p
              className="truncate text-[0.8125rem] text-muted-foreground max-sm:whitespace-normal"
              title={item.notes}
            >
              {item.notes}
            </p>
          ) : (
            <span className="text-[0.8125rem] text-fg-tertiary max-sm:hidden" aria-hidden="true">
              —
            </span>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border border-y border-border" role="status" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="h-7 w-36" />
        </div>
      ))}
      <span className="sr-only">Carregando verificações…</span>
    </div>
  );
}

export default function CrmVerificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<CrmVerificationItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  // S25-CRM-01 — dialog de confirmação para aprovar (antes era direto).
  const [approveTarget, setApproveTarget] = useState<CrmVerificationItem | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);

  const query = useCrmVerifications(activeTab);
  // Contagem de pendentes sempre visível na aba (mesma chave de cache quando
  // a aba ativa já é "Pendentes" — não duplica a requisição).
  const pendingQuery = useCrmVerifications('PENDING');
  const resolveMutation = useResolveCrmVerification();

  const items = useMemo<CrmVerificationItem[]>(() => query.data ?? [], [query.data]);
  const loading = query.isPending;
  const error = query.error?.message ?? null;
  const pendingCount = pendingQuery.data?.length;

  const term = search.trim();
  const visibleItems = useMemo(
    () => items.filter((item) => matchesSearch(item, term)),
    [items, term],
  );
  const isPendingTab = activeTab === 'PENDING';

  function handleApprove(item: CrmVerificationItem) {
    // S25-CRM-01 — abre dialog de confirmação em vez de aprovar direto.
    // Rejeitar já pedia confirmação (via dialog de motivo); aprovar não.
    // Agora os dois pedem — simetria evita cliques acidentais.
    setApproveTarget(item);
    setApproveOpen(true);
  }

  function handleApproveConfirm() {
    if (!approveTarget) return;
    const target = approveTarget;
    resolveMutation.mutate(
      { id: target.id, body: { action: 'approve' } },
      {
        onSuccess: () => {
          toast.success(`CRM de ${physicianLabel(target)} aprovado.`);
          setApproveOpen(false);
          setApproveTarget(null);
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : 'Erro ao aprovar verificação.';
          toast.error(msg);
        },
      },
    );
  }

  function handleRejectClick(item: CrmVerificationItem) {
    setRejectTarget(item);
    setRejectOpen(true);
  }

  function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    resolveMutation.mutate(
      { id: rejectTarget.id, body: { action: 'reject', notes: reason } },
      {
        onSuccess: () => {
          toast.success(`Verificação de ${physicianLabel(rejectTarget)} rejeitada.`);
          setRejectOpen(false);
          setRejectTarget(null);
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : 'Erro ao rejeitar verificação.';
          toast.error(msg);
        },
      },
    );
  }

  const empty = EMPTY_COPY[activeTab];

  return (
    <Page width="wide">
      <PageHeader
        icon={ShieldCheck}
        title="Verificações CRM"
        description="Fila de aprovação e rejeição de CRM médico. Toda decisão fica registrada na trilha de auditoria."
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="gap-0">
        {/* Barra de view do database: abas à esquerda, busca à direita. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:border-b sm:border-border">
          <TabsList aria-label="Filtrar por status" className="max-sm:w-full sm:border-b-0 max-sm:group-data-horizontal/tabs:h-10">
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              const count = tab.value === 'PENDING' ? pendingCount : tab.value === activeTab && !loading ? items.length : undefined;
              return (
                <TabsTrigger key={tab.value} value={tab.value}>
                  <TabIcon aria-hidden="true" />
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className={cn(
                        'ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] px-1 text-xs font-normal tabular-nums',
                        tab.value === 'PENDING'
                          ? 'bg-tone-orange-tag text-tone-orange-ink'
                          : 'bg-tone-gray-tag text-tone-gray-ink',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className="flex items-center gap-1.5 sm:pb-1">
            <div className="relative flex-1 sm:w-60 sm:flex-none">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, e-mail ou CRM"
                aria-label="Buscar verificações por nome, e-mail ou CRM"
                className="h-7 pl-7 text-[0.8125rem] md:text-[0.8125rem]"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:size-10"
              aria-label="Atualizar lista"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <ArrowClockwise className={cn(query.isFetching && 'animate-spin')} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <TabsContent value={activeTab} className="pt-3">
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Erro ao carregar verificações</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                  <ArrowClockwise aria-hidden="true" />
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <div className="border-y border-border">
              <EmptyState
                icon={<ShieldCheck weight="duotone" />}
                title={empty.title}
                description={empty.description}
              />
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="border-y border-border">
              <EmptyState
                icon={<MagnifyingGlass />}
                title="Nenhum resultado"
                description={`Nenhuma verificação corresponde a “${term}”.`}
                actionLabel="Limpar busca"
                onAction={() => setSearch('')}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="relative w-full overflow-x-auto">
                <Table aria-label={`Verificações CRM — ${TABS.find((t) => t.value === activeTab)?.label}`} className="max-sm:block">
                  <TableHeader className="max-sm:hidden">
                    <TableRow>
                      <TableHead className="min-w-[14rem]">Médico</TableHead>
                      <TableHead className="w-16">UF</TableHead>
                      <TableHead>CRM</TableHead>
                      <TableHead>Solicitado em</TableHead>
                      {!isPendingTab && <TableHead>Resolvido em</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>{isPendingTab ? 'Ações' : 'Observação'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="max-sm:block">
                    {visibleItems.map((item) => (
                      <VerificationRow
                        key={item.id}
                        item={item}
                        isPending={isPendingTab}
                        onApprove={handleApprove}
                        onReject={handleRejectClick}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="px-1 text-xs text-muted-foreground tabular-nums">
                {visibleItems.length === items.length
                  ? `${items.length} ${items.length === 1 ? 'verificação' : 'verificações'}`
                  : `${visibleItems.length} de ${items.length} verificações`}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        item={rejectTarget}
        onConfirm={handleRejectConfirm}
        loading={resolveMutation.isPending}
      />

      {/*
        S25-CRM-01 — dialog de confirmação para APROVAR. Antes era direto
        (assimétrico com rejeitar que pedia motivo). Agora pede confirmação
        simples — aprovação é irreversível e afeta o médico (libera acesso).
      */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle variant="brand">Confirmar aprovação de CRM</DialogTitle>
            <DialogDescription>
              {approveTarget && (
                <>
                  Médico: <strong className="font-medium text-foreground">{physicianLabel(approveTarget)}</strong>
                  <br />
                  CRM: {approveTarget.physician.crmUf} {approveTarget.physician.crmNumber}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A aprovação libera acesso ao Copiloto Clínico para este médico.
            A ação é <strong className="font-medium text-foreground">irreversível</strong> e fica registrada na auditoria.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={resolveMutation.isPending} onClick={handleApproveConfirm}>
              <Check weight="bold" aria-hidden="true" />
              {resolveMutation.isPending ? 'Aprovando...' : 'Confirmar aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
