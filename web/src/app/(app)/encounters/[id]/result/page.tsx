"use client";

import { use, useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { CopilotAnalysis } from "@/lib/types";

const STORAGE_KEY_PREFIX = "copilot_result_";

interface LatestInteractionResponse {
  interactionId: string;
  output: CopilotAnalysis;
  citations: CopilotAnalysis["citations"];
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);
  const [result, setResult] = useState<CopilotAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${encounterId}`;

    // Try sessionStorage first (fast path — just navigated from capture)
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CopilotAnalysis;
        setResult(parsed);
        setLoading(false);
        return;
      }
    } catch {
      // fall through to API
    }

    // Fetch from API (page reload or direct navigation)
    apiClient
      .get<LatestInteractionResponse>(`/encounters/${encounterId}/copilot/latest`)
      .then((data) => {
        const analysis: CopilotAnalysis = {
          ...data.output,
          citations: data.citations,
          uncertainty: data.uncertainty,
          uncertaintyReason: data.uncertaintyReason,
        };
        setResult(analysis);
        // Repopulate sessionStorage so subsequent navigation is fast
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(analysis));
        } catch {
          // storage quota — non-critical
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Erro ao carregar análise.";
        setFetchError(message);
      })
      .finally(() => setLoading(false));
  }, [encounterId]);

  async function handleGenerateDocument(type: "soap" | "sbar") {
    setGeneratingDoc(type);
    setDocError(null);

    try {
      const doc = await apiClient.post<{ id: string }>("/documents", {
        encounterId,
        type,
      });
      window.location.href = `/encounters/${encounterId}/documents/${doc.id}`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao gerar documento.";
      setDocError(message);
      setGeneratingDoc(null);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (fetchError || !result) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            {fetchError && (
              <Alert variant="destructive" className="mb-2">
                <AlertTitle>Erro ao carregar análise</AlertTitle>
                <AlertDescription>{fetchError}</AlertDescription>
              </Alert>
            )}
            <p className="text-muted-foreground">
              Nenhum resultado de análise encontrado.
            </p>
            <Button asChild>
              <a href={`/encounters/${encounterId}/capture`}>
                Ir para análise
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedRecommendations = [...result.recommendations].sort(
    (a, b) => b.confidence - a.confidence,
  );

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Resultado da Análise
        </h1>
        <Badge variant="secondary">
          {result.recommendations.length} recomendações
        </Badge>
      </div>

      {result.uncertainty && (
        <Alert className="border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <AlertTitle>Incerteza na análise</AlertTitle>
          <AlertDescription>
            {result.uncertaintyReason ??
              "O copiloto indicou incerteza nesta análise. Recomenda-se revisão adicional."}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recomendações</h2>
        {sortedRecommendations.map((rec, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">{rec.action}</CardTitle>
                  <CardDescription>{rec.rationale}</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {rec.sourceText}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {result.citations.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Citações</h2>
            <div className="space-y-2">
              {result.citations.map((citation, index) => (
                <div
                  key={index}
                  className="space-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {citation.source} v{citation.sourceVersion}
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

      {docError && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{docError}</AlertDescription>
        </Alert>
      )}

      <Separator />

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => handleGenerateDocument("soap")}
          disabled={generatingDoc !== null}
        >
          {generatingDoc === "soap" ? "Gerando..." : "Gerar Documento SOAP"}
        </Button>
        <Button
          onClick={() => handleGenerateDocument("sbar")}
          disabled={generatingDoc !== null}
        >
          {generatingDoc === "sbar" ? "Gerando..." : "Gerar Documento SBAR"}
        </Button>
        <Button variant="outline" asChild>
          <a href={`/encounters/${encounterId}/capture`}>Nova Análise</a>
        </Button>
        <Button variant="ghost" asChild>
          <a href={`/encounters/${encounterId}`}>Voltar ao Atendimento</a>
        </Button>
      </div>
    </div>
  );
}
