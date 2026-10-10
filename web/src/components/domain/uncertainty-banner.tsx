'use client';

import { Warning } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { messages } from '@/lib/messages';

interface UncertaintyBannerProps {
  reason?: string | null;
  title?: string;
  className?: string;
  /**
   * UX-02 — ação primária: abre o campo de complemento livre do caso.
   * Omitida quando não há mais rodadas de reanálise disponíveis (ver
   * canComplement no hook use-copilot-conversation) — nesse caso o banner
   * segue honesto sobre a incerteza, mas sem oferecer uma ação quebrada.
   */
  onComplementCase?: () => void;
  /**
   * UX-02 — ação secundária: abre a consulta de diretrizes DENTRO do caso
   * (painel lateral). Antes era um link para /guidelines que tirava o médico
   * do caso sem caminho de volta (relato do piloto, 25/09/2026).
   */
  onSearchGuidelines?: () => void;
}

/**
 * Callout laranja: incerteza fala do RACIOCÍNIO (faltam dados, a evidência
 * não fecha) e pede uma ação do médico antes de seguir o plano — por isso o
 * tom de "muda a conduta". Ver também CoverageBanner, que fala da BASE.
 */
export function UncertaintyBanner({
  reason,
  title = messages.uncertainty.title,
  className,
  onComplementCase,
  onSearchGuidelines,
}: UncertaintyBannerProps) {
  const hasAction = Boolean(onComplementCase || onSearchGuidelines);

  return (
    <Alert variant="warning" className={className}>
      <Warning weight="fill" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{reason ?? messages.uncertainty.defaultReason}</p>
        {/* UX-02 — nenhum estado do copiloto pode terminar sem um próximo
            passo disponível; um banner de incerteza sem ação é exatamente
            o beco sem saída que a Sprint 26 eliminou no backend. */}
        {hasAction && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {onComplementCase && (
              <Button type="button" size="sm" onClick={onComplementCase}>
                {messages.uncertainty.actions.complementCase}
              </Button>
            )}
            {onSearchGuidelines && (
              <Button type="button" size="sm" variant="outline" onClick={onSearchGuidelines}>
                {messages.uncertainty.actions.searchGuidelines}
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
