"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CopilotConversation } from "@/components/copilot/copilot-conversation";
import {
  STORAGE_KEY_PREFIX,
  type StoredCopilotResult,
} from "@/hooks/use-copilot-conversation";
import type { CopilotAnalysis } from "@/lib/types";

interface LatestInteractionResponse {
  interactionId: string;
  output: CopilotAnalysis;
  citations: CopilotAnalysis["citations"];
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);
  const router = useRouter();
  const [result, setResult] = useState<StoredCopilotResult | null>(null);
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
        const parsed = JSON.parse(stored) as StoredCopilotResult;
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
        const stored: StoredCopilotResult = {
          interactionId: data.interactionId,
          analysis,
        };
        setResult(stored);
        // Repopulate sessionStorage so subsequent navigation is fast
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(stored));
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
      router.push(`/encounters/${encounterId}/documents/${doc.id}`);
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

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <CopilotConversation encounterId={encounterId} initial={result} />

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
