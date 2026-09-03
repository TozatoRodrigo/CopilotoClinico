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
  RetrievalCoverage,
} from "@/lib/types";

export const STORAGE_KEY_PREFIX = "copilot_result_";

// UX-08 — bug relatado ao vivo por um médico do piloto: respondeu as
// perguntas esclarecedoras, viu o copiloto reagir, mas saiu do atendimento
// sem clicar em "Reanalisar" nem gerar/assinar o documento (fluxo comum
// num plantão — interrupções constantes). Ao voltar, as respostas tinham
// sumido. Antes desta mudança, `answers` era estado 100% em memória
// (useState puro) — nunca sobrevivia a uma desmontagem do componente.
// Agora todo `setAnswer` grava um rascunho no sessionStorage (mesmo
// mecanismo de privacidade já usado para o rascunho de texto do caso em
// capture/page.tsx — expira com a aba, não persiste indefinidamente no
// dispositivo). Restaurado ao montar SE E SOMENTE SE ainda for o mesmo
// turno (`interactionId`) — um turno novo pode ter perguntas totalmente
// diferentes, então um rascunho de um turno antigo não faz sentido.
const DRAFT_ANSWERS_KEY_PREFIX = "copilot_draft_answers_";

function loadDraftAnswers(
  encounterId: string,
  interactionId: string,
): Record<string, ClarifyingAnswerValue> {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_ANSWERS_KEY_PREFIX}${encounterId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      interactionId: string;
      answers: Record<string, ClarifyingAnswerValue>;
    };
    if (parsed.interactionId !== interactionId) return {};
    return parsed.answers ?? {};
  } catch {
    return {};
  }
}

function persistDraftAnswers(
  encounterId: string,
  interactionId: string,
  answers: Record<string, ClarifyingAnswerValue>,
): void {
  try {
    sessionStorage.setItem(
      `${DRAFT_ANSWERS_KEY_PREFIX}${encounterId}`,
      JSON.stringify({ interactionId, answers }),
    );
  } catch {
    // storage quota — não crítico, mesmo padrão de persist() abaixo
  }
}

function clearDraftAnswers(encounterId: string): void {
  try {
    sessionStorage.removeItem(`${DRAFT_ANSWERS_KEY_PREFIX}${encounterId}`);
  } catch {
    // não crítico
  }
}

/**
 * UX-02 — questionId sintético usado por complementCase() quando não há
 * clarifyingQuestion pendente para ancorar a resposta. O backend
 * (continueAnalysis) já degrada graciosamente para usar o próprio id como
 * rótulo quando não encontra a pergunta correspondente — ver
 * orchestrator.service.ts.
 */
const COMPLEMENT_QUESTION_ID = "Informações adicionais fornecidas pelo médico";

export interface StoredCopilotResult {
  interactionId: string;
  analysis: CopilotAnalysis;
  /**
   * UX-03 — turno desta interação (0 = análise inicial) e teto configurado
   * de turnos, ecoados pelo backend em toda resposta (analyze/respond) e em
   * GET /copilot/latest. Guardados junto ao restante do estado persistido
   * para o indicador de progresso funcionar tanto na sessão viva quanto
   * num carregamento fresco de página.
   */
  turnIndex: number;
  maxTurns: number;
  /**
   * KB-005/KB-006 — cobertura da base de diretrizes para este turno, para o
   * aviso de "a base não cobre este cenário" (CoverageBanner) sobreviver a um
   * reload. `null` em interações anteriores à mudança — a UI então não mostra
   * aviso nenhum, em vez de assumir cobertura.
   */
  retrievalCoverage: RetrievalCoverage | null;
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
  const [turnIndex, setTurnIndex] = useState(initial.turnIndex);
  const [maxTurns, setMaxTurns] = useState(initial.maxTurns);
  const [retrievalCoverage, setRetrievalCoverage] = useState(initial.retrievalCoverage);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  // UX-08 — inicializa a partir do rascunho salvo (se ainda for do mesmo
  // turno), não de um objeto vazio — ver comentário acima de
  // DRAFT_ANSWERS_KEY_PREFIX.
  const [answers, setAnswers] = useState<Record<string, ClarifyingAnswerValue>>(() =>
    loadDraftAnswers(encounterId, initial.interactionId),
  );
  const [reanalyzing, setReanalyzing] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const persist = useCallback(
    (
      id: string,
      data: CopilotAnalysis,
      turn: number,
      max: number,
      coverage: RetrievalCoverage | null,
    ) => {
      try {
        const stored: StoredCopilotResult = {
          interactionId: id,
          analysis: data,
          turnIndex: turn,
          maxTurns: max,
          retrievalCoverage: coverage,
        };
        sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${encounterId}`, JSON.stringify(stored));
      } catch {
        // storage quota — non-critical
      }
    },
    [encounterId],
  );

  const setAnswer = useCallback(
    (questionId: string, value: ClarifyingAnswerValue) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        // UX-08 — grava o rascunho a cada mudança, não só ao reanalisar.
        persistDraftAnswers(encounterId, interactionId, next);
        return next;
      });
    },
    [encounterId, interactionId],
  );

  const applyResult = useCallback(
    (result: CopilotAnalyzeResponse) => {
      const newAnalysis: CopilotAnalysis = { ...result.output, citations: result.citations };
      setTurns((prev) => [...prev, { turnIndex: prev.length, analysis }]);
      setAnalysis(newAnalysis);
      setInteractionId(result.interactionId);
      setTurnIndex(result.metadata.turnIndex);
      setMaxTurns(result.metadata.maxTurns);
      setAnswers({});
      // UX-08 — as respostas deste turno já foram incorporadas ao novo
      // resultado persistido abaixo; o rascunho correspondente não serve
      // mais (e um rascunho órfão poderia, em tese, ser restaurado por
      // engano contra um turno futuro que reaproveite o mesmo id por
      // coincidência — limpar é mais seguro que deixar).
      clearDraftAnswers(encounterId);
      setRetrievalCoverage(result.metadata.retrievalCoverage);
      persist(
        result.interactionId,
        newAnalysis,
        result.metadata.turnIndex,
        result.metadata.maxTurns,
        result.metadata.retrievalCoverage,
      );
    },
    [analysis, persist, encounterId],
  );

  // UX-02 — lógica de envio compartilhada entre "Reanalisar" (respostas a
  // perguntas específicas) e "Complementar o caso" (texto livre, sem
  // pergunta pendente) — mesmo endpoint /respond, mesmo tratamento de
  // offline/erro, só muda como o payload de answers é montado.
  const submitAnswers = useCallback(
    async (answersPayload: ClarifyingAnswer[]): Promise<boolean> => {
      if (answersPayload.length === 0) return false;

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
        // UX-02 — "sucesso" aqui significa "aceito para envio posterior",
        // não "já reanalisado". O chamador (ex: campo de complemento) pode
        // limpar o texto com segurança — o offline-queue é a fonte de
        // verdade dali em diante.
        return true;
      }

      setReanalyzing(true);
      try {
        const result = await apiClient.post<CopilotAnalyzeResponse>(
          `/encounters/${encounterId}/copilot/respond`,
          { interactionId, answers: answersPayload },
        );
        applyResult(result);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao reanalisar.";
        setRespondError(message);
        return false;
      } finally {
        setReanalyzing(false);
      }
    },
    [isOnline, encounterId, interactionId, applyResult],
  );

  const reanalyze = useCallback(async () => {
    const answersPayload: ClarifyingAnswer[] = analysis.clarifyingQuestions
      .filter((question) => answers[question.id] !== undefined)
      .map((question) => ({
        questionId: question.id,
        answer: answers[question.id] as ClarifyingAnswerValue,
      }));
    await submitAnswers(answersPayload);
  }, [analysis.clarifyingQuestions, answers, submitAnswers]);

  // UX-02 — "Complementar o caso": funciona MESMO sem nenhuma
  // clarifyingQuestion pendente (o caso que a incerteza sem perguntas
  // deixava sem saída). Reaproveita /respond com um questionId sintético —
  // o backend já trata isso graciosamente (usa o próprio id como rótulo
  // quando não encontra a pergunta correspondente) e o texto entra no
  // caso aumentado que alimenta um retrieval novo, quebrando o ciclo
  // entrada-pobre → retrieval-fraco → incerteza sem próximo passo.
  const complementCase = useCallback(
    async (freeText: string): Promise<boolean> => {
      const trimmed = freeText.trim();
      if (!trimmed) return false;
      return submitAnswers([{ questionId: COMPLEMENT_QUESTION_ID, answer: trimmed }]);
    },
    [submitAnswers],
  );

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
    turnIndex,
    maxTurns,
    retrievalCoverage,
    // UX-03 — se o médico responder AGORA, o backend computa
    // newTurnIndex = turnIndex + 1 e força esse turno a ser o final quando
    // newTurnIndex === maxTurns - 1 (ver continueAnalysis() / forceFinal).
    // Ou seja: turnIndex atual === maxTurns - 2 é o ÚLTIMO turno em que
    // ainda vale a pena perguntar de novo — a próxima resposta já vem sem
    // clarifyingQuestions. A UI precisa avisar ANTES de responder, não
    // depois que o backend já forçou o encerramento.
    isLastAllowedTurn: turnIndex === maxTurns - 2,
    turns,
    answers,
    setAnswer,
    reanalyze,
    complementCase,
    reanalyzing,
    respondError,
    queued,
    canReanalyze: someAnswered && !reanalyzing,
    // UX-02 — espelha a regra do backend (continueAnalysis bloqueia quando
    // newTurnIndex >= maxTurns, ou seja, turnIndex atual já é maxTurns-1).
    // Sem este gate, "Complementar o caso" — que não depende de perguntas
    // pendentes para habilitar — poderia ser acionado num estado terminal
    // e estourar um 400 cru no médico.
    canComplement: turnIndex < maxTurns - 1 && !reanalyzing,
  };
}
