import { memo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CitationFootnote } from '@/components/domain/citation-footnote';
import { cn } from '@/lib/utils';
import { useMessages } from '@/lib/messages/use-messages';
import type { Messages } from '@/lib/messages';
import {
  CheckCircle as CheckCircleIcon,
  Info,
  XCircle as XCircleIcon,
  PencilSimple as PencilSimpleIcon,
} from '@phosphor-icons/react';
import type { CopilotRecommendation } from '@/lib/types';
import type { RecommendationDecisionState } from '@/hooks/use-recommendation-decisions';

// PI-05 — recebe `messages` já resolvido no locale do médico (useMessages());
// função de módulo não pode chamar um hook diretamente.
function getCategoryLabel(
  messages: Messages,
  category?: CopilotRecommendation['category'],
): string | null {
  switch (category) {
    case 'stabilization':
      return messages.recommendation.category.stabilization;
    case 'diagnostic':
      return messages.recommendation.category.diagnostic;
    case 'therapeutic':
      return messages.recommendation.category.therapeutic;
    case 'verify':
      return messages.recommendation.category.verify;
    default:
      return null;
  }
}

interface RecommendationCardProps {
  rec: CopilotRecommendation;
  /**
   * S23-CLIN-06 — decisão atual do médico (adotada/rejeitada/anotada).
   * Se undefined, a recomendação está "pendente".
   */
  decision?: RecommendationDecisionState;
  onAdopt?: (recId: string) => void;
  onReject?: (recId: string) => void;
  onNote?: (recId: string, note: string) => void;
}

export const RecommendationCard = memo(function RecommendationCard({
  rec,
  decision,
  onAdopt,
  onReject,
  onNote,
}: RecommendationCardProps) {
  const messages = useMessages();
  const isStabilization = rec.category === 'stabilization';
  const categoryLabel = getCategoryLabel(messages, rec.category);
  const isRejected = decision?.decision === 'rejected';
  const isAdopted = decision?.decision === 'adopted';
  const [showNote, setShowNote] = useState(false);

  // ID estável por recomendação (action + source como chave composta).
  const recId = rec.citationChunkId ?? rec.action.slice(0, 32);

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 transition-opacity',
        rec.preliminary
          ? 'border-clinical-line bg-white/40'
          : isStabilization
            ? 'border-clinical-amber/30 bg-clinical-amber-bg'
            : 'border-clinical-green/30 bg-clinical-green-bg',
        // S23-CLIN-06 — rec rejeitada fica atenuada (não some — médico pode mudar de ideia).
        isRejected && 'opacity-50',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              'font-medium text-foreground',
              isStabilization ? 'text-base' : 'text-sm',
              // Rec rejeitada — action riscada para feedback visual rápido.
              isRejected && 'line-through',
            )}
          >
            {rec.action}
          </p>
          <p className="text-sm text-muted-foreground">{rec.rationale}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {categoryLabel && (
            <Badge variant={isStabilization ? 'warning' : rec.preliminary ? 'outline' : 'success'}>
              {categoryLabel}
            </Badge>
          )}
          {rec.preliminary && (
            <Badge variant="secondary">{messages.recommendation.preliminary}</Badge>
          )}
          {!rec.preliminary && (
            // S23-UX-01 — tooltip explica a metodologia para evitar falsa
            // precisão clínica. "87%" sem contexto pode parecer garantia.
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 rounded-full border border-input bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={messages.recommendation.confidenceTooltipTitle}
                >
                  {messages.recommendation.confidence(rec.confidence)}
                  <Info className="size-3" weight="bold" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs px-3 py-2 text-left">
                <div className="space-y-1">
                  <p className="font-semibold">
                    {messages.recommendation.confidenceTooltipTitle}
                  </p>
                  <p className="text-[11px] leading-relaxed text-clinical-paper/90">
                    {messages.recommendation.confidenceTooltipBody}
                  </p>
                  <p className="text-[11px] italic leading-relaxed text-clinical-paper/70">
                    {messages.recommendation.confidenceTooltipDisclaimer}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {/* S23-CLIN-06 — selo de decisão atual */}
          {isAdopted && (
            <Badge variant="success" className="gap-1">
              <CheckCircleIcon className="size-3" weight="fill" />
              Adotada
            </Badge>
          )}
          {isRejected && (
            <Badge variant="destructive" className="gap-1">
              <XCircleIcon className="size-3" weight="fill" />
              Rejeitada
            </Badge>
          )}
        </div>
      </div>

      <CitationFootnote
        source={rec.source}
        sourceVersion={rec.sourceVersion}
        text={rec.sourceText}
        href={rec.sourceUrl}
        className="mt-2"
      />

      {/*
        S23-CLIN-06 — ações por recomendação. Adotar (verde) / Rejeitar
        (vermelho) / Anotar (âmbar, expande textarea). Toggle — clicar de
        novo em "Adotar" limpa a decisão. Não bloqueia geração de documento
        (que usa todas as recomendações por default); é estado de revisão.
      */}
      {(onAdopt || onReject || onNote) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-clinical-line/50 pt-3">
          <Button
            type="button"
            size="sm"
            variant={isAdopted ? 'default' : 'outline'}
            className={cn(
              'h-7 gap-1 px-2 text-xs',
              !isAdopted && 'border-clinical-green/30 text-clinical-green hover:bg-clinical-green-bg',
            )}
            aria-pressed={isAdopted}
            onClick={() => {
              if (isAdopted) return; // já adotada — não toggle por enquanto
              onAdopt?.(recId);
            }}
          >
            <CheckCircleIcon className="size-3.5" weight={isAdopted ? 'fill' : 'regular'} />
            Adotar
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isRejected ? 'destructive' : 'outline'}
            className={cn(
              'h-7 gap-1 px-2 text-xs',
              !isRejected && 'border-destructive/30 text-destructive hover:bg-destructive/5',
            )}
            aria-pressed={isRejected}
            onClick={() => {
              if (isRejected) return;
              onReject?.(recId);
            }}
          >
            <XCircleIcon className="size-3.5" weight={isRejected ? 'fill' : 'regular'} />
            Rejeitar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-clinical-amber/40 px-2 text-xs text-clinical-amber-foreground hover:bg-clinical-amber-bg"
            aria-expanded={showNote}
            onClick={() => setShowNote((s) => !s)}
          >
            <PencilSimpleIcon className="size-3.5" />
            {decision?.note ? 'Editar nota' : 'Anotar'}
          </Button>

          {showNote && (
            <div className="mt-2 w-full">
              <Textarea
                aria-label={`Anotação para: ${rec.action}`}
                value={decision?.note ?? ''}
                onChange={(e) => onNote?.(recId, e.target.value)}
                placeholder="Observação clínica sobre esta recomendação..."
                className="min-h-[60px] resize-y text-sm"
                rows={2}
              />
            </div>
          )}

          {decision?.note && !showNote && (
            <p className="w-full text-xs italic text-muted-foreground">
              “{decision.note}”
            </p>
          )}
        </div>
      )}
    </div>
  );
});
