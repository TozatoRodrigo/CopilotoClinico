import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CopilotRecommendation } from "@/lib/types";

function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function RecommendationCard({ rec }: { rec: CopilotRecommendation }) {
  return (
    <Card className={cn(rec.preliminary && "opacity-60")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{rec.action}</CardTitle>
            <CardDescription>{rec.rationale}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Fonte:{" "}
          <a
            className="font-medium text-foreground underline underline-offset-4"
            href={rec.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {rec.source} v{rec.sourceVersion}
          </a>
        </p>
        <p className="line-clamp-3 text-sm text-muted-foreground">{rec.sourceText}</p>
      </CardContent>
    </Card>
  );
}
