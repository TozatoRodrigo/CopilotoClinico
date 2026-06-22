'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  Check,
  Clock,
  SealCheck,
  SealWarning,
  ShieldCheck,
  X,
} from '@phosphor-icons/react';
import { useCrmVerifications, useResolveCrmVerification } from '@/lib/clinical-queries';
import type { CrmVerificationItem, CrmVerificationStatus } from '@/lib/types';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/domain/empty-state';
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

const TABS: { value: Tab; label: string; icon: typeof Clock }[] = [
  { value: 'PENDING', label: 'Pendentes', icon: Clock },
  { value: 'APPROVED', label: 'Aprovados', icon: SealCheck },
  { value: 'REJECTED', label: 'Rejeitados', icon: SealWarning },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [reason, setReason] = useState('');

  // S25-CRM-01 — reseta motivo quando o dialog abre para um NOVO item.
  // Antes o texto do motivo anterior "vazava" para o próximo item rejeitado,
  // causando erro de auditoria (motivo errado atribuído ao médico errado).
  useEffect(() => {
    if (open && item) {
      setReason('');
    }
  }, [open, item?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle variant="brand">Rejeitar verificação CRM</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                Médico: <strong>{item.physician.name ?? item.physician.email}</strong> — CRM{' '}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  );
}

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
  return (
    <div className="border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/30">
      {/*
        S22-DS-01 — layout responsivo. Desktop: grid de 5 colunas (era fixo,
        quebrava em < 640px). Mobile: card com labels em cima dos valores e
        ações empilhadas no fim (touch-friendly).
      */}
      {/* Desktop (sm+) */}
      <div className="hidden grid-cols-[2fr_1.5fr_1fr_1fr_auto] items-center gap-3 sm:grid">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.physician.name ?? 'Sem nome'}</p>
          <p className="truncate text-xs text-muted-foreground">{item.physician.email}</p>
        </div>
        <div className="font-mono text-xs">
          <span className="text-muted-foreground">CRM </span>
          {item.physician.crmUf} {item.physician.crmNumber}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {formatDate(item.requestedAt)}
        </div>
        <div>{renderStatusBadge(item.status)}</div>
        <div className="flex items-center gap-1">
          {renderActions(item, isPending, onApprove, onReject)}
        </div>
      </div>

      {/* Mobile (< sm) */}
      <div className="space-y-2 sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{item.physician.name ?? 'Sem nome'}</p>
            <p className="truncate text-xs text-muted-foreground">{item.physician.email}</p>
          </div>
          {renderStatusBadge(item.status)}
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CRM
          </span>
          <span className="min-w-0 flex-1 text-right font-mono text-xs">
            {item.physician.crmUf} {item.physician.crmNumber}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isPending ? 'Solicitado' : 'Resolvido'}
          </span>
          <span className="min-w-0 flex-1 text-right font-mono text-xs text-muted-foreground">
            {formatDate(item.requestedAt)}
          </span>
        </div>
        {isPending && (
          <div className="flex gap-2 pt-1">
            {renderActions(item, isPending, onApprove, onReject)}
          </div>
        )}
        {!isPending && item.notes && (
          <p className="truncate text-xs text-muted-foreground" title={item.notes}>
            {item.notes}
          </p>
        )}
      </div>
    </div>
  );
}

function renderStatusBadge(status: CrmVerificationStatus) {
  if (status === 'APPROVED') {
    return (
      <Badge variant="outline" className="border-clinical-green/30 text-clinical-green">
        <SealCheck className="mr-1 size-3" />
        Aprovado
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive">
        <SealWarning className="mr-1 size-3" />
        Rejeitado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-clinical-amber/30 text-clinical-amber">
      <Clock className="mr-1 size-3" />
      Pendente
    </Badge>
  );
}

function renderActions(
  item: CrmVerificationItem,
  isPending: boolean,
  onApprove: (item: CrmVerificationItem) => void,
  onReject: (item: CrmVerificationItem) => void,
) {
  if (!isPending) {
    return item.notes ? (
      <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={item.notes}>
        {item.notes}
      </span>
    ) : null;
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 border-clinical-green/30 text-clinical-green hover:bg-clinical-green-bg"
        onClick={() => onApprove(item)}
      >
        <Check className="size-3.5" />
        Aprovar
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 border-destructive/30 text-destructive hover:bg-destructive/5"
        onClick={() => onReject(item)}
      >
        <X className="size-3.5" />
        Rejeitar
      </Button>
    </>
  );
}

export default function CrmVerificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');
  const [rejectTarget, setRejectTarget] = useState<CrmVerificationItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  // S25-CRM-01 — dialog de confirmação para aprovar (antes era direto).
  const [approveTarget, setApproveTarget] = useState<CrmVerificationItem | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);

  const query = useCrmVerifications(activeTab);
  const resolveMutation = useResolveCrmVerification();

  const items: CrmVerificationItem[] = query.data ?? [];
  const loading = query.isPending;
  const error = query.error?.message ?? null;

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
          toast.success(`CRM de ${target.physician.name ?? target.physician.email} aprovado.`);
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
          toast.success(`Verificação de ${rejectTarget.physician.name ?? rejectTarget.physician.email} rejeitada.`);
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" weight="duotone" />
          <h1 className="text-lg font-semibold tracking-tight">Verificações CRM</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Fila de aprovação e rejeição de CRM médico com trilha de auditoria
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {tab.label}
              {isActive && items.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {items.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar verificações</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <ArrowClockwise className="mr-1 size-3.5" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<ShieldCheck className="size-10" weight="duotone" />}
              title={
                activeTab === 'PENDING'
                  ? 'Fila zerada'
                  : activeTab === 'APPROVED'
                    ? 'Nenhuma verificação aprovada'
                    : 'Nenhuma verificação rejeitada'
              }
              description={
                activeTab === 'PENDING'
                  ? 'Não há solicitações de CRM aguardando análise no momento.'
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="hidden grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid">
            <span>Médico</span>
            <span>CRM</span>
            <span>{activeTab === 'PENDING' ? 'Solicitado' : 'Resolvido'}</span>
            <span>Status</span>
            <span>Ações</span>
          </div>
          {items.map((item) => (
            <VerificationRow
              key={item.id}
              item={item}
              isPending={activeTab === 'PENDING'}
              onApprove={handleApprove}
              onReject={handleRejectClick}
            />
          ))}
        </Card>
      )}

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
                  Médico: <strong>{approveTarget.physician.name ?? approveTarget.physician.email}</strong>
                  <br />
                  CRM: {approveTarget.physician.crmUf} {approveTarget.physician.crmNumber}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A aprovação libera acesso ao Copiloto Clínico para este médico.
            A ação é <strong>irreversível</strong> e fica registrada na auditoria.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={resolveMutation.isPending}
              onClick={handleApproveConfirm}
              className="gap-1"
            >
              <Check className="size-4" weight="bold" />
              {resolveMutation.isPending ? 'Aprovando...' : 'Confirmar aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
