import { Badge } from '@/components/ui/badge';
import { CitationFootnote } from '@/components/domain/citation-footnote';
import { cn } from '@/lib/utils';
import type { CopilotRecommendation } from '@/lib/types';

function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function getCategoryLabel(category?: CopilotRecommendation['category']): string | null {
  switch (category) {
    case 'stabilization':
      return 'Agora';
    case 'diagnostic':
      return 'Diagnóstico';
    case 'therapeutic':
      return 'Conduta';
    case 'verify':
      return 'Reavaliar';
    default:
      return null;
  }
}

export function RecommendationCard({ rec }: { rec: CopilotRecommendation }) {
  const isStabilization = rec.category === 'stabilization';
  const categoryLabel = getCategoryLabel(rec.category);

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        rec.preliminary
          ? 'border-clinical-line bg-white/40'
          : isStabilization
            ? 'border-clinical-amber/30 bg-clinical-amber-bg'
            : 'border-clinical-green/30 bg-clinical-green-bg',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p
            className={cn('font-medium text-foreground', isStabilization ? 'text-base' : 'text-sm')}
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
            <Badge variant="secondary">Preliminar — responda as perguntas acima</Badge>
          )}
          {!rec.preliminary && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {confidencePercent(rec.confidence)}
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
    </div>
  );
}
