"use client";

import { useState } from "react";
import { Microphone, Stop, WarningCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ClarifyingQuestions } from "@/components/copilot/clarifying-questions";
import { RecommendationCard } from "@/components/copilot/recommendation-card";
import { TurnHistory } from "@/components/copilot/turn-history";
import { UncertaintyBanner } from "@/components/domain/uncertainty-banner";
import { useWhisperVoice } from "@/hooks/use-whisper-voice";
import { messages } from "@/lib/messages";
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
    turnIndex,
    maxTurns,
    isLastAllowedTurn,
    turns,
    answers,
    setAnswer,
    reanalyze,
    complementCase,
    reanalyzing,
    respondError,
    queued,
    canReanalyze,
    canComplement,
  } = useCopilotConversation(encounterId, initial);

  // UX-02 — "Complementar o caso": único gatilho hoje é o banner de
  // incerteza, que é exatamente o estado que antes deixava o médico sem
  // próximo passo (uncertainty=true, clarifyingQuestions vazio).
  const [showComplementField, setShowComplementField] = useState(false);

  const sortedRecommendations = [...analysis.recommendations].sort(compareRecommendations);

  // UX-02 — ação secundária do banner: busca manual, já preenchida a
  // partir do motivo da incerteza (o que a diretriz não cobre), não do
  // texto bruto do caso — mais direto para achar o protocolo certo.
  const guidelinesHref = analysis.uncertaintyReason
    ? `/guidelines?q=${encodeURIComponent(analysis.uncertaintyReason)}`
    : undefined;

  async function handleComplementSubmit(text: string) {
    const succeeded = await complementCase(text);
    // Só fecha o campo em caso de sucesso — numa falha, o texto digitado
    // fica preservado para o médico tentar de novo (ver respondError).
    if (succeeded) setShowComplementField(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{messages.copilot.result.title}</h1>
        <Badge variant="secondary">{messages.copilot.result.recommendationsCount(analysis.recommendations.length)}</Badge>
      </div>

      {analysis.uncertainty && (
        <UncertaintyBanner
          reason={analysis.uncertaintyReason}
          onComplementCase={canComplement ? () => setShowComplementField(true) : undefined}
          guidelinesHref={guidelinesHref}
        />
      )}

      {/* UX-02 — condicionado a analysis.uncertainty (não só a
          showComplementField): se o complemento resolver a incerteza, a
          nova análise chega com uncertainty=false e este bloco some
          sozinho — sem precisar de lógica extra para "detectar sucesso". */}
      {analysis.uncertainty && showComplementField && (
        <ComplementCaseField
          onSubmit={handleComplementSubmit}
          onCancel={() => setShowComplementField(false)}
          submitting={reanalyzing}
        />
      )}

      {/* UX-02 — erro/enfileiramento agora podem vir de duas origens
          (responder pergunta OU complementar o caso), então ficam fora do
          bloco de clarifyingQuestions — antes só apareciam ali, e um erro
          ao complementar o caso (sem perguntas pendentes) não tinha onde
          ser mostrado. */}
      {respondError && (
        <Alert variant="destructive">
          <AlertTitle>{messages.copilot.reanalyze.errorTitle}</AlertTitle>
          <AlertDescription>{respondError}</AlertDescription>
        </Alert>
      )}

      {queued && (
        <Alert className="border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground">
          <AlertTitle>{messages.copilot.queued.title}</AlertTitle>
          <AlertDescription>{messages.copilot.queued.descriptionLong}</AlertDescription>
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

          {/* UX-03 — indicador de progresso: o ciclo de perguntas pode ter
              até `maxTurns` rodadas (COPILOT_MAX_TURNS no backend); sem isto
              o médico não tem como saber se está perto do fim ou preso num
              loop. Discreto de propósito — é orientação, não o elemento
              dominante da tela. */}
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">
              {messages.copilot.progress.round(turnIndex + 1, maxTurns)}
            </p>
            <p
              className={
                isLastAllowedTurn
                  ? "text-xs font-medium text-clinical-amber-foreground"
                  : "text-xs text-muted-foreground"
              }
            >
              {isLastAllowedTurn
                ? messages.copilot.progress.lastRoundWarning
                : messages.copilot.progress.expectationHint}
            </p>
          </div>

          <Button onClick={reanalyze} disabled={!canReanalyze}>
            {reanalyzing ? messages.copilot.reanalyze.loading : messages.copilot.reanalyze.ctaShort}
          </Button>

          <Separator />
        </>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{messages.copilot.recommendations.heading}</h2>
        {sortedRecommendations.map((rec, index) => (
          <RecommendationCard key={index} rec={rec} />
        ))}
      </div>

      {analysis.differentials.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{messages.copilot.differentials.heading}</h2>
          <div className="space-y-3">
            {/* PI-03 — "não pode perder" primeiro. sort() é estável (spec
                ECMA desde ES2019), preserva a ordem relativa dentro de
                cada grupo — não embaralha o que o backend já ordenou. */}
            {[...analysis.differentials]
              .sort((a, b) => Number(b.cannotMiss) - Number(a.cannotMiss))
              .map((differential, index) => (
                <div
                  key={index}
                  className={
                    differential.cannotMiss
                      ? "rounded-xl border border-clinical-error/40 bg-clinical-error-bg px-4 py-3"
                      : "rounded-xl border border-foreground/10 bg-muted/20 px-4 py-3"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {differential.cannotMiss && (
                      <WarningCircle
                        className="size-4 shrink-0 text-clinical-error"
                        weight="fill"
                        aria-hidden="true"
                      />
                    )}
                    <p className="font-medium text-foreground">{differential.hypothesis}</p>
                    {differential.cannotMiss && (
                      <Badge
                        variant="outline"
                        className="border-clinical-error/40 text-clinical-error-foreground"
                      >
                        {messages.copilot.differentials.cannotMiss}
                        {differential.timeToHarm && ` · ${differential.timeToHarm}`}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{differential.whyConsider}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium text-foreground">{messages.copilot.differentials.whatDistinguishes}</span>{" "}
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
            <h2 className="text-lg font-semibold">{messages.copilot.citations.heading}</h2>
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
                          {messages.copilot.citations.institutionalBadge}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          {messages.copilot.citations.publicBadge}
                        </Badge>
                      )}
                    </span>
                    <a
                      className="shrink-0 text-muted-foreground underline underline-offset-4"
                      href={`/v1/guidelines/chunks/${citation.chunkId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.copilot.citations.viewExcerpt}
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

/**
 * UX-02 — campo de complemento livre do caso, com o mesmo ditado por voz
 * da tela de captura (useWhisperVoice). Fica isolado como subcomponente
 * porque tem estado próprio (o texto sendo digitado/ditado) que não deve
 * vazar para o resto da conversa.
 */
function ComplementCaseField({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (text: string) => void | Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [text, setText] = useState("");
  const voice = useWhisperVoice();

  function handleMicToggle() {
    if (voice.isListening) {
      voice.stop();
      return;
    }
    voice.start((transcript) => {
      setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-clinical-line bg-muted/20 p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {messages.uncertainty.complement.heading}
      </h3>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={messages.uncertainty.complement.placeholder}
        rows={3}
        disabled={submitting}
        aria-label={messages.uncertainty.complement.heading}
      />
      {voice.error && <p className="text-xs text-destructive">{voice.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {voice.isSupported && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMicToggle}
            disabled={submitting || voice.isUploading}
          >
            {voice.isListening ? (
              <Stop className="mr-1.5 size-4" aria-hidden="true" />
            ) : (
              <Microphone className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {voice.isListening ? "Parar" : "Ditar"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => void onSubmit(text)}
          disabled={submitting || voice.isListening || !text.trim()}
        >
          {submitting
            ? messages.uncertainty.complement.submitting
            : messages.uncertainty.complement.submit}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {messages.uncertainty.complement.cancel}
        </Button>
      </div>
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
