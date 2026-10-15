'use client';

import { useId, useState } from 'react';
import { Copy } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AttachToCaseButton } from './case-link';

export interface CopyToChartButtonProps {
  /** Texto pronto para o prontuário; `null` enquanto não há resultado. */
  text: string | null;
  className?: string;
}

/**
 * Botão "Copiar para o prontuário" (CC-305). Se o navegador negar a área de
 * transferência (permissão, iframe, http), mostra o texto selecionável no
 * lugar: o médico nunca fica sem o que colar. Na ferramenta aberta pelo plano
 * do Copiloto, o mesmo texto também pode ser anexado ao caso (CC-332).
 */
export function CopyToChartButton({ text, className }: CopyToChartButtonProps) {
  const fallbackId = useId();
  const [fallback, setFallback] = useState<string | null>(null);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      toast.success('Copiado. Cole no prontuário.');
    } catch {
      setFallback(text);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={copy} disabled={!text}>
          <Copy aria-hidden="true" />
          Copiar para o prontuário
        </Button>
        <AttachToCaseButton text={text} />
      </div>
      {fallback ? (
        <div className="mt-2 flex flex-col gap-1">
          <label htmlFor={fallbackId} className="text-xs text-muted-foreground">
            Não deu para copiar automaticamente. Selecione o texto e copie.
          </label>
          <textarea
            id={fallbackId}
            readOnly
            value={fallback}
            rows={Math.min(10, fallback.split('\n').length + 1)}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-input bg-surface-input px-3 py-2 text-sm text-foreground"
          />
        </div>
      ) : null}
    </div>
  );
}
