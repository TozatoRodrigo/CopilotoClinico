'use client';

import { ArrowClockwise, CloudCheck } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useToolsOffline, type ToolsOfflineState } from '@/lib/tools-offline';

function describe({ status, version }: ToolsOfflineState): string | null {
  switch (status) {
    case 'pronto':
      return `Disponível sem conexão · versão do conteúdo ${version ?? '—'}`;
    case 'baixando':
      return 'Guardando as ferramentas no aparelho para uso sem conexão…';
    case 'incompleto':
      return 'Ainda não disponível sem conexão: o download recomeça quando houver sinal.';
    default:
      return null;
  }
}

/**
 * Rodapé das Ferramentas (CC-322): se o conteúdo já está no aparelho e em que
 * versão. Quando o sinal volta e chega conteúdo novo, a versão muda aqui e a
 * página oferece recarregar para usar a nova.
 */
export function ToolsOfflineFooter() {
  const state = useToolsOffline();
  const text = describe(state);
  if (!text) return null;
  return (
    <footer
      data-slot="tools-offline-footer"
      className="mx-auto mt-8 flex w-full max-w-[720px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground"
    >
      <span className="flex items-center gap-1.5" role="status">
        <CloudCheck className="size-3.5 shrink-0" aria-hidden="true" />
        {text}
      </span>
      {state.updated ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => window.location.reload()}>
          <ArrowClockwise aria-hidden="true" />
          Conteúdo atualizado — recarregar
        </Button>
      ) : null}
    </footer>
  );
}
