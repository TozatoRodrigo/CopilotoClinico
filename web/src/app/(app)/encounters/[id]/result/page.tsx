"use client";

import { use, useState } from "react";
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

type Urgency = "low" | "medium" | "high" | "critical";

interface Recommendation {
  category: string;
  title: string;
  description: string;
  urgency: Urgency;
  evidenceLevel: string;
}

interface Citation {
  source: string;
  chunkId: string;
  relevance: number;
}

interface CopilotResponse {
  recommendations: Recommendation[];
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

const URGENCY_ORDER: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const URGENCY_STYLES: Record<Urgency, string> = {
  critical: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  high: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  low: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
};

const URGENCY_LABELS: Record<Urgency, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

const STORAGE_KEY_PREFIX = "copilot_result_";

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  let result: CopilotResponse | null = null;
  let parseError = false;

  try {
    const stored = sessionStorage.getItem(
      `${STORAGE_KEY_PREFIX}${encounterId}`,
    );
    if (stored) {
      result = JSON.parse(stored) as CopilotResponse;
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

  const sortedRecommendations = [...result.recommendations].sort(
    (a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency],
  );

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
                  <CardTitle className="text-base">{rec.title}</CardTitle>
                  <CardDescription>{rec.description}</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{rec.category}</Badge>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${URGENCY_STYLES[rec.urgency]}`}
                  >
                    {URGENCY_LABELS[rec.urgency]}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Nível de evidência: {rec.evidenceLevel}
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
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2 text-sm"
                >
                  <span className="font-medium">{citation.source}</span>
                  <span className="text-muted-foreground">
                    Relevância: {(citation.relevance * 100).toFixed(0)}%
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
