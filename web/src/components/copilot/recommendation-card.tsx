import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CitationFootnote } from "@/components/domain/citation-footnote";
import { cn } from "@/lib/utils";
import type { CopilotRecommendation } from "@/lib/types";

function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function getCategoryLabel(category?: CopilotRecommendation["category"]): string | null {
  switch (category) {
    case "stabilization":
      return "Agora";
    case "diagnostic":
      return "Diagnóstico";
    case "therapeutic":
      return "Conduta";
    case "verify":
      return "Reavaliar";
    default:
      return null;
  }
}

export function RecommendationCard({ rec }: { rec: CopilotRecommendation }) {
  const isStabilization = rec.category === "stabilization";
  const categoryLabel = getCategoryLabel(rec.category);

  return (
    <Card
      className={cn(
        rec.preliminary && "opacity-60",
        isStabilization && "border-clinical-amber/30 bg-clinical-amber-bg shadow-sm",
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className={cn("text-base", isStabilization && "text-lg")}>
              {rec.action}
            </CardTitle>
            <CardDescription>{rec.rationale}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {categoryLabel && (
              <Badge variant={isStabilization ? "warning" : "outline"}>{categoryLabel}</Badge>
            )}
            {rec.preliminary && (
              <Badge variant="secondary">
                Preliminar — responda as perguntas acima
              </Badge>
            )}
            <Badge variant="outline">
              Confiança: {confidencePercent(rec.confidence)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CitationFootnote
          source={rec.source}
          sourceVersion={rec.sourceVersion}
          text={rec.sourceText}
          href={rec.sourceUrl}
        />
      </CardContent>
    </Card>
  );
}
