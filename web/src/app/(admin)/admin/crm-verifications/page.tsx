'use client';

import { useState } from 'react';
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
            autoFocus
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
    <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] items-center gap-3 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/30">
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
      <div>
        {item.status === 'APPROVED' && (
          <Badge variant="outline" className="border-clinical-green/30 text-clinical-green">
            <SealCheck className="mr-1 size-3" />
            Aprovado
          </Badge>
        )}
        {item.status === 'REJECTED' && (
          <Badge variant="outline" className="border-destructive/30 text-destructive">
            <SealWarning className="mr-1 size-3" />
            Rejeitado
          </Badge>
        )}
        {item.status === 'PENDING' && (
          <Badge variant="outline" className="border-clinical-amber/30 text-clinical-amber">
            <Clock className="mr-1 size-3" />
            Pendente
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isPending && (
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
        )}
        {!isPending && item.notes && (
          <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={item.notes}>
            {item.notes}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CrmVerificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');
  const [rejectTarget, setRejectTarget] = useState<CrmVerificationItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  const query = useCrmVerifications(activeTab);
  const resolveMutation = useResolveCrmVerification();

  const items: CrmVerificationItem[] = query.data ?? [];
  const loading = query.isPending;
  const error = query.error?.message ?? null;

  function handleApprove(item: CrmVerificationItem) {
    resolveMutation.mutate(
      { id: item.id, body: { action: 'approve' } },
      {
        onSuccess: () => toast.success(`CRM de ${item.physician.name ?? item.physician.email} aprovado.`),
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
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
    </div>
  );
}
