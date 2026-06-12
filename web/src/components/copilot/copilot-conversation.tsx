"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ClarifyingQuestions } from "@/components/copilot/clarifying-questions";
import { RecommendationCard } from "@/components/copilot/recommendation-card";
import { TurnHistory } from "@/components/copilot/turn-history";
import {
  useCopilotConversation,
  type StoredCopilotResult,
} from "@/hooks/use-copilot-conversation";
import type { CopilotRecommendation } from "@/lib/types";

interface CopilotConversationProps {
  encounterId: string;
  initial: StoredCopilotResult;
}

export function CopilotConversation({ encounterId, initial }: CopilotConversationProps) {
  const {
    analysis,
    turns,
    answers,
    setAnswer,
    reanalyze,
    reanalyzing,
    respondError,
    queued,
    canReanalyze,
  } = useCopilotConversation(encounterId, initial);

  const sortedRecommendations = [...analysis.recommendations].sort(compareRecommendations);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Resultado da Análise</h1>
        <Badge variant="secondary">{analysis.recommendations.length} recomendações</Badge>
      </div>

      {analysis.uncertainty && (
        <Alert className="border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground">
          <AlertTitle>Incerteza na análise</AlertTitle>
          <AlertDescription>
            {analysis.uncertaintyReason ??
              "O copiloto indicou incerteza nesta análise. Recomenda-se revisão adicional."}
          </AlertDescription>
        </Alert>
      )}

      {analysis.clarifyingQuestions.length > 0 && (
        <>
          <ClarifyingQuestions
            questions={analysis.clarifyingQuestions}
            answers={answers}
            onAnswerChange={setAnswer}
            disabled={reanalyzing}
          />

          {respondError && (
            <Alert variant="destructive">
              <AlertTitle>Erro ao reanalisar</AlertTitle>
              <AlertDescription>{respondError}</AlertDescription>
            </Alert>
          )}

          {queued && (
            <Alert className="border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground">
              <AlertTitle>Resposta enfileirada</AlertTitle>
              <AlertDescription>
                Sem conexão no momento. A resposta será enviada automaticamente quando você
                voltar a ficar online.
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={reanalyze} disabled={!canReanalyze}>
            {reanalyzing ? "Reanalisando..." : "Reanalisar"}
          </Button>

          <Separator />
        </>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recomendações</h2>
        {sortedRecommendations.map((rec, index) => (
          <RecommendationCard key={index} rec={rec} />
        ))}
      </div>

      {analysis.differentials.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Já considerou?</h2>
          <div className="space-y-3">
            {analysis.differentials.map((differential, index) => (
              <div
                key={index}
                className="rounded-xl border border-foreground/10 bg-muted/20 px-4 py-3"
              >
                <p className="font-medium text-foreground">{differential.hypothesis}</p>
                <p className="mt-1 text-sm text-muted-foreground">{differential.whyConsider}</p>
                <p className="mt-2 text-sm">
                  <span className="font-medium text-foreground">O que diferencia:</span>{" "}
                  <span className="text-muted-foreground">
                    {differential.whatDistinguishes}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.citations.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Citações</h2>
            <div className="space-y-2">
              {analysis.citations.map((citation, index) => (
                <div
                  key={index}
                  className="space-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">
                        {citation.source} v{citation.sourceVersion}
                      </span>
                      {citation.origin === "institutional" ? (
                        <Badge variant="secondary" className="shrink-0">
                          Protocolo institucional
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          Diretriz pública
                        </Badge>
                      )}
                    </span>
                    <a
                      className="shrink-0 text-muted-foreground underline underline-offset-4"
                      href={`/v1/guidelines/chunks/${citation.chunkId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver trecho
                    </a>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground">{citation.text}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {turns.length > 0 && (
        <>
          <Separator />
          <TurnHistory turns={turns} />
        </>
      )}
    </div>
  );
}

function compareRecommendations(left: CopilotRecommendation, right: CopilotRecommendation): number {
  const order = {
    stabilization: 0,
    diagnostic: 1,
    therapeutic: 2,
    verify: 3,
  } as const;
  const leftWeight = order[left.category ?? "therapeutic"];
  const rightWeight = order[right.category ?? "therapeutic"];

  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight;
  }

  return right.confidence - left.confidence;
}
