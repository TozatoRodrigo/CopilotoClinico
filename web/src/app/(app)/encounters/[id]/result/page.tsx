"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { CopilotAnalysis } from "@/lib/types";

const STORAGE_KEY_PREFIX = "copilot_result_";

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);
  const router = useRouter();
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  let result: CopilotAnalysis | null = null;
  let parseError = false;

  try {
    const stored = sessionStorage.getItem(
      `${STORAGE_KEY_PREFIX}${encounterId}`,
    );
    if (stored) {
      result = JSON.parse(stored) as CopilotAnalysis;
    }
  } catch {
    parseError = true;
  }

  if (!result || parseError) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
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

  const analysis = result;

  const sortedRecommendations = [...analysis.output.recommendations].sort(
    (a, b) => b.confidence - a.confidence,
  );

  async function handleGenerateDocument(type: "soap" | "sbar") {
    setGeneratingDoc(type);
    setDocError(null);
    const interactionId = analysis.interactionId;

    try {
      const doc = await apiClient.post<{ id: string }>(
        `/encounters/${encounterId}/documents`,
        {
          type,
          aiInteractionId: interactionId,
        },
      );
      router.push(`/encounters/${encounterId}/documents/${doc.id}/edit`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao gerar documento.";
      setDocError(message);
      setGeneratingDoc(null);
    }
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Resultado da Análise
        </h1>
        <Badge variant="secondary">
          {analysis.output.recommendations.length} recomendações
        </Badge>
      </div>

      {analysis.output.uncertainty && (
        <Alert className="border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <AlertTitle>Incerteza na análise</AlertTitle>
          <AlertDescription>
            {analysis.output.uncertaintyReason ??
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
                    {Math.round(rec.confidence * 100)}%
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Fonte: {rec.citationChunkId}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {analysis.citations.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Citações</h2>
            <div className="space-y-2">
              {analysis.citations.map((citation, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2 text-sm"
                >
                  <span className="font-medium">{citation.source}</span>
                  <span className="text-muted-foreground">
                    Versão: {citation.sourceVersion}
                  </span>
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
