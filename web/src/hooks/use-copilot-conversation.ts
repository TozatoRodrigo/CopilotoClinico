"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { addToQueue } from "@/lib/offline-queue";
import { syncOfflineQueue } from "@/lib/copilot-queue";
import { useOnlineStatus } from "@/components/providers/offline-provider";
import type {
  ClarifyingAnswer,
  ClarifyingAnswerValue,
  CopilotAnalysis,
  CopilotAnalyzeResponse,
} from "@/lib/types";

export const STORAGE_KEY_PREFIX = "copilot_result_";

export interface StoredCopilotResult {
  interactionId: string;
  analysis: CopilotAnalysis;
}

export interface TurnRecord {
  turnIndex: number;
  analysis: CopilotAnalysis;
}

export function useCopilotConversation(
  encounterId: string,
  initial: StoredCopilotResult,
) {
  const { isOnline } = useOnlineStatus();
  const [interactionId, setInteractionId] = useState(initial.interactionId);
  const [analysis, setAnalysis] = useState(initial.analysis);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [answers, setAnswers] = useState<Record<string, ClarifyingAnswerValue>>({});
  const [reanalyzing, setReanalyzing] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const persist = useCallback(
    (id: string, data: CopilotAnalysis) => {
      try {
        const stored: StoredCopilotResult = { interactionId: id, analysis: data };
        sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${encounterId}`, JSON.stringify(stored));
      } catch {
        // storage quota — non-critical
      }
    },
    [encounterId],
  );

  const setAnswer = useCallback((questionId: string, value: ClarifyingAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const applyResult = useCallback(
    (result: CopilotAnalyzeResponse) => {
      const newAnalysis: CopilotAnalysis = { ...result.output, citations: result.citations };
      setTurns((prev) => [...prev, { turnIndex: prev.length, analysis }]);
      setAnalysis(newAnalysis);
      setInteractionId(result.interactionId);
      setAnswers({});
      persist(result.interactionId, newAnalysis);
    },
    [analysis, persist],
  );

  const reanalyze = useCallback(async () => {
    const answersPayload: ClarifyingAnswer[] = analysis.clarifyingQuestions
      .filter((question) => answers[question.id] !== undefined)
      .map((question) => ({
        questionId: question.id,
        answer: answers[question.id] as ClarifyingAnswerValue,
      }));

    if (answersPayload.length === 0) return;

    setRespondError(null);

    if (!isOnline) {
      await addToQueue({
        type: "respond",
        encounterId,
        interactionId,
        answers: answersPayload,
      });
      setQueued(true);
      toast.info("Sem conexão. Resposta será enviada quando voltar online.");
      return;
    }

    setReanalyzing(true);
    try {
      const result = await apiClient.post<CopilotAnalyzeResponse>(
        `/encounters/${encounterId}/copilot/respond`,
        { interactionId, answers: answersPayload },
      );
      applyResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao reanalisar.";
      setRespondError(message);
    } finally {
      setReanalyzing(false);
    }
  }, [analysis.clarifyingQuestions, answers, isOnline, encounterId, interactionId, applyResult]);

  useEffect(() => {
    if (!isOnline || !queued) return;

    syncOfflineQueue().then(({ respondedEncounters }) => {
      const match = respondedEncounters.find((entry) => entry.encounterId === encounterId);
      setQueued(false);
      if (match) {
        applyResult(match.result);
        toast.success("Resposta enviada e análise atualizada.");
      }
    });
  }, [isOnline, queued, encounterId, applyResult]);

  const someAnswered = analysis.clarifyingQuestions.some(
    (question) => answers[question.id] !== undefined,
  );

  return {
    analysis,
    interactionId,
    turns,
    answers,
    setAnswer,
    reanalyze,
    reanalyzing,
    respondError,
    queued,
    canReanalyze: someAnswered && !reanalyzing,
  };
}
