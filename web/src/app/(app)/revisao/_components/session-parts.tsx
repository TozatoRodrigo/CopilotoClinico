'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Robot, Stethoscope, Timer } from '@phosphor-icons/react';
import type { KnowledgeCardVersionView } from '@contracts/knowledge-cards';
import { ApiError } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { formatElapsed, type VisibleTimer } from '../_lib/review-timer';
import { sourceAnchorId } from './card-sources';

/** Peças comuns à revisão (CC-404) e à revisão cruzada (CC-411). */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** O tempo no cartão, atualizado a cada segundo sem re-renderizar o cartão inteiro. */
export function ElapsedClock({ timer }: { timer: VisibleTimer }) {
  const [elapsed, setElapsed] = useState(() => timer.elapsedMs());
  useEffect(() => {
    const interval = setInterval(() => setElapsed(timer.elapsedMs()), 1000);
    return () => clearInterval(interval);
  }, [timer]);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <Timer aria-hidden="true" className="size-3.5" />
      <span className="sr-only">Tempo neste cartão: </span>
      {formatElapsed(elapsed)}
    </span>
  );
}

export function AuthorBadge({ version }: { version: KnowledgeCardVersionView }) {
  if (version.authorKind === 'ai') {
    return (
      <Badge variant="blue">
        <Robot weight="bold" aria-hidden="true" />
        Rascunho da IA
      </Badge>
    );
  }
  return (
    <Badge variant="gray">
      <Stethoscope weight="bold" aria-hidden="true" />
      Correção de {version.authorPhysician?.name ?? 'um médico'}
    </Badge>
  );
}

/** Quais fontes estão abertas, e o atalho da citação que abre a fonte e rola até ela. */
export function useSourceNavigation() {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());

  const openSource = useCallback((key: string) => {
    setOpenKeys((keys) => new Set(keys).add(key));
    // Depois de o Disclosure abrir, para rolar até o texto e não até o título fechado.
    requestAnimationFrame(() => {
      document
        .getElementById(sourceAnchorId(key))
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const toggleSource = useCallback((key: string, open: boolean) => {
    setOpenKeys((keys) => {
      const next = new Set(keys);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return { openKeys, openSource, toggleSource };
}

/**
 * Erro de uma decisão. 409/404: o cartão saiu da fila (outro revisor decidiu,
 * a versão mudou) — avisa e a fila recarrega; o resto só avisa.
 */
export function reportDecisionFailure(
  error: Error,
  fallback: string,
  onStale: () => void,
): 'stale' | 'failed' {
  if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
    toast.error(error.message);
    onStale();
    return 'stale';
  }
  toast.error(error instanceof ApiError ? error.message : fallback);
  return 'failed';
}
