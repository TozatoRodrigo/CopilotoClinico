"use client";

import { use, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface CopilotContext {
  hasCT: boolean;
  isSus: boolean;
  hasLab: boolean;
  hasICU: boolean;
}

interface Recommendation {
  category: string;
  title: string;
  description: string;
  urgency: "low" | "medium" | "high" | "critical";
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

interface ContextChip {
  key: keyof CopilotContext;
  label: string;
}

const CONTEXT_CHIPS: ContextChip[] = [
  { key: "hasCT", label: "TC" },
  { key: "isSus", label: "SUS" },
  { key: "hasLab", label: "Labs" },
  { key: "hasICU", label: "UTI" },
];

const MIN_CHARS = 10;

export default function CapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);

  const [caseText, setCaseText] = useState("");
  const [context, setContext] = useState<CopilotContext>({
    hasCT: false,
    isSus: false,
    hasLab: false,
    hasICU: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertainty, setUncertainty] = useState(false);
  const [uncertaintyReason, setUncertaintyReason] = useState<string | null>(
    null,
  );

  const isValid = caseText.trim().length >= MIN_CHARS;

  function toggleContext(key: keyof CopilotContext) {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    if (!isValid || loading) return;

    setLoading(true);
    setError(null);
    setUncertainty(false);
    setUncertaintyReason(null);

    try {
      const result = await apiClient.post<CopilotResponse>(
        `/copilot/${encounterId}/analyze`,
        { caseText: caseText.trim(), context },
      );

      if (result.uncertainty) {
        setUncertainty(true);
        setUncertaintyReason(result.uncertaintyReason);
      }

      sessionStorage.setItem(
        `copilot_result_${encounterId}`,
        JSON.stringify(result),
      );
      window.location.href = `/encounters/${encounterId}/result`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao analisar o caso.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Copiloto Clínico — Análise de Caso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="case-text"
              className="text-sm font-medium text-foreground"
            >
              Descreva o caso clínico
            </label>
            <Textarea
              id="case-text"
              placeholder="Descreva o caso clínico do paciente, incluindo sinais, sintomas, histórico e achados relevantes..."
              className="min-h-[200px] resize-y"
              value={caseText}
              onChange={(e) => setCaseText(e.target.value)}
              disabled={loading}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {caseText.trim().length < MIN_CHARS
                  ? `Mínimo de ${MIN_CHARS} caracteres`
                  : "Texto válido"}
              </span>
              <span>{caseText.trim().length} caracteres</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Contexto do atendimento
            </span>
            <div className="flex flex-wrap gap-2">
              {CONTEXT_CHIPS.map((chip) => (
                <Badge
                  key={chip.key}
                  variant={context[chip.key] ? "default" : "outline"}
                  className="cursor-pointer select-none px-3 py-1.5 text-sm transition-colors hover:opacity-80"
                  onClick={() => toggleContext(chip.key)}
                >
                  {chip.label}
                </Badge>
              ))}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {uncertainty && (
            <Alert className="border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
              <AlertTitle>Incerteza detectada</AlertTitle>
              <AlertDescription>
                {uncertaintyReason ??
                  "O copiloto indicou incerteza nesta análise. Recomenda-se revisão adicional."}
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!isValid || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="size-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Analisando...
              </span>
            ) : (
              "Analisar com Copiloto"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
