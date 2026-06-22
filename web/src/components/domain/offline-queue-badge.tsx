'use client';

/**
 * S23-CLIN-03 — Badge persistente no header mostrando itens pendentes offline.
 *
 * Visível apenas quando count > 0. Tap abre um Sheet com:
 * - Lista de itens pendentes (tipo, patientRef/encounterId, timestamp)
 * - Botão "Sincronizar agora" (se online)
 * - Botão "Descartar" por item
 *
 * Resolvia o problema: médico tinha análise na fila e não sabia — só via
 * toast efêmero no momento do enfileiramento.
 */
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { ArrowsClockwise, Trash, WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

const ITEM_LABELS: Record<string, string> = {
  analyze: 'Análise',
  respond: 'Resposta',
  audio_transcribe: 'Áudio',
};

export function OfflineQueueBadge() {
  const { items, count, isSyncing, syncNow, removeItem } = useOfflineQueue();
  const { isOnline } = useOnlineStatus();
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
            'border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground',
            'hover:bg-clinical-amber/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label={`${count} itens pendentes para sincronizar`}
        >
          <WarningCircle className="size-3.5" weight="fill" aria-hidden="true" />
          <span>
            {count} pendente{count !== 1 ? 's' : ''}
          </span>
          {isSyncing && (
            <ArrowsClockwise
              className="size-3 animate-spin"
              aria-hidden="true"
            />
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-base">
            Fila offline
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? 'item pendente' : 'itens pendentes'}.
            {isOnline
              ? ' Sincronização automática ativa.'
              : ' Serão enviados quando voltar online.'}
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {ITEM_LABELS[item.type] ?? item.type}
                  </Badge>
                  <span className="truncate text-sm font-medium">
                    {item.type === 'respond'
                      ? `Atendimento ${item.encounterId.slice(0, 8)}`
                      : `Atendimento ${item.encounterId.slice(0, 8)}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelative(item.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => void removeItem(item.id)}
                aria-label="Descartar item da fila"
                title="Descartar"
              >
                <Trash className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {isOnline && (
          <div className="mt-4 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isSyncing}
              onClick={() => void syncNow()}
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
