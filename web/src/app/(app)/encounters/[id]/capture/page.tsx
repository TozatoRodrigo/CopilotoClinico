"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useOnlineStatus } from "@/components/providers/offline-provider";
import { addToQueue } from "@/lib/offline-queue";
import { syncOfflineQueue } from "@/lib/copilot-queue";
import { STORAGE_KEY_PREFIX } from "@/hooks/use-copilot-conversation";
import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CopilotAnalysis, CopilotAnalyzeResponse, EncounterContext } from "@/lib/types";
import { getDemoCasePreset } from "@/lib/demo-case-presets";

interface ContextChip {
  key: keyof EncounterContext;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOnline } = useOnlineStatus();
  const demoPreset = getDemoCasePreset(searchParams.get("demoCase"));

  const [caseText, setCaseText] = useState("");
  const [context, setContext] = useState<EncounterContext>({
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

  const {
    isListening,
    startListening,
    stopListening,
    isSupported: isVoiceSupported,
    error: voiceError,
  } = useVoiceInput();

  useEffect(() => {
    if (voiceError) {
      toast.error(voiceError);
    }
  }, [voiceError]);

  useEffect(() => {
    if (!demoPreset || caseText.trim()) return;

    setCaseText(demoPreset.caseText);
    setContext(demoPreset.context);
  }, [caseText, demoPreset]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setCaseText((prev) => {
      const separator = prev.trim() ? " " : "";
      return prev + separator + text;
    });
  }, []);

  const processOfflineQueue = useCallback(async () => {
    await syncOfflineQueue();
  }, []);

  useEffect(() => {
    if (isOnline) {
      processOfflineQueue();
    }
  }, [isOnline, processOfflineQueue]);

  const isValid = caseText.trim().length >= MIN_CHARS;

  function toggleContext(key: keyof EncounterContext) {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    if (!isValid || loading) return;

    if (!isOnline) {
      await addToQueue({
        type: "analyze",
        encounterId,
        caseText: caseText.trim(),
        context,
      });
      toast.info(
        "Sem conexão. Análise será enviada quando voltar online.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setUncertainty(false);
    setUncertaintyReason(null);

    try {
      const result = await apiClient.post<CopilotAnalyzeResponse>(
        `/encounters/${encounterId}/copilot/analyze`,
        { caseText: caseText.trim(), context },
      );
      const analysis: CopilotAnalysis = {
        ...result.output,
        citations: result.citations,
      };

      if (analysis.uncertainty) {
        setUncertainty(true);
        setUncertaintyReason(analysis.uncertaintyReason);
      }

      sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${encounterId}`,
        JSON.stringify({ interactionId: result.interactionId, analysis }),
      );
      router.push(`/encounters/${encounterId}/result`);
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
          {demoPreset && (
            <Alert>
              <AlertTitle>{demoPreset.title}</AlertTitle>
              <AlertDescription>{demoPreset.summary}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label
              htmlFor="case-text"
              className="text-sm font-medium text-foreground"
            >
              Descreva o caso clínico
            </label>
            <div className="relative">
              <Textarea
                id="case-text"
                placeholder="Descreva o caso clínico do paciente, incluindo sinais, sintomas, histórico e achados relevantes..."
                className="min-h-[200px] resize-y pr-12"
                value={caseText}
                onChange={(e) => setCaseText(e.target.value)}
                disabled={loading}
              />
              <div className="absolute bottom-2 right-2">
                {isVoiceSupported ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={
                      isListening
                        ? "animate-pulse bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500"
                        : ""
                    }
                    onClick={() =>
                      isListening
                        ? stopListening()
                        : startListening(handleVoiceTranscript)
                    }
                    disabled={loading}
                    aria-label={isListening ? "Parar gravação" : "Iniciar gravação"}
                  >
                    {isListening ? (
                      <MicrophoneSlash className="size-5" />
                    ) : (
                      <Microphone className="size-5" />
                    )}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled
                          aria-label="Entrada por voz não suportada"
                        >
                          <Microphone className="size-5 opacity-50" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Navegador não suporta entrada por voz
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
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
