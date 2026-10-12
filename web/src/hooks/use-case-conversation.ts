"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { clinicalQueryKeys } from "@/lib/clinical-queries";
import { addToQueue } from "@/lib/offline-queue";
import { syncOfflineQueue } from "@/lib/copilot-queue";
import { useOnlineStatus } from "@/components/providers/offline-provider";
import { markFirstAnalysisDone } from "@/components/domain/install-prompt-banner";
import { useCopilotStream } from "@/hooks/use-copilot-stream";
import { useMessages } from "@/lib/messages/use-messages";
import {
  COMPLEMENT_QUESTION_ID,
  fromClarifyingQuestion,
  UNDERSTANDING_CORRECTION_QUESTION_ID,
  type ConversationQuestion,
} from "@/lib/case-conversation";
import type {
  CaseConversationResponse,
  ClarifyingAnswer,
  EncounterContext,
  IntakeAnswerChannel,
  IntakeAnswerValue,
  IntakeView,
} from "@/lib/types";

/**
 * ADR-014 — a conversa do caso: o caso entra, o Copiloto pergunta (no
 * máximo 3, uma por vez) ou vai direto ao plano, e as perguntas que a
 * decisão deixa depois do plano também são feitas uma por vez.
 *
 * O servidor guarda a conversa (GET /copilot/conversation): o médico
 * interrompido volta de qualquer aparelho na pergunta da vez, e um plano
 * que estava sendo montado quando a aba fechou aparece quando ficar pronto.
 */

const DEFAULT_MAX_TURNS = 5;
const POLL_INTERVAL_MS = 4_000;
/** Plano que não saiu: a conversa ainda confere de vez em quando se ele chegou atrasado. */
const SLOW_POLL_INTERVAL_MS = 15_000;
/** Mesmo teto do servidor (INTAKE_ANALYSIS_STALE_MS): depois disso, a rodada é dada como perdida. */
const PENDING_STALE_MS = 6 * 60_000;

export interface StartCaseInput {
  caseText: string;
  context: EncounterContext;
  redFlags: Record<string, boolean>;
  demoCase?: string;
}

interface FollowUpAnswer {
  value: string | number;
  label: string;
}

/**
 * UX-08 — respostas às perguntas de depois do plano, por rodada, no
 * sessionStorage: sobrevivem a uma interrupção e expiram com a aba.
 */
interface FollowUpDraft {
  interactionId: string | null;
  answers: Record<string, FollowUpAnswer>;
  dismissed: boolean;
}

/** Reanálise em andamento: se a página recarregar no meio, a conversa espera por ela. */
interface PendingRespond {
  parentInteractionId: string;
  startedAt: number;
}

const followUpKey = (encounterId: string) => `copilot_follow_up_${encounterId}`;
const pendingRespondKey = (encounterId: string) => `copilot_pending_respond_${encounterId}`;

function readSession<Value>(key: string): Value | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Value) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage quota ou modo privado — não crítico
  }
}

/** Marca de reanálise de uma visita anterior; passada do teto, a rodada é dada como perdida. */
function readPendingRespond(encounterId: string): PendingRespond | null {
  const pending = readSession<PendingRespond>(pendingRespondKey(encounterId));
  if (!pending || Date.now() - pending.startedAt >= PENDING_STALE_MS) return null;
  return pending;
}

function emptyDraft(interactionId: string | null): FollowUpDraft {
  return { interactionId, answers: {}, dismissed: false };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type ConversationPhase =
  | "loading"
  | "compose"
  | "asking"
  | "planning"
  | "plan_failed"
  | "plan";

export function useCaseConversation(encounterId: string) {
  const messages = useMessages();
  const copy = messages.conversation;
  const queryClient = useQueryClient();
  const { isOnline } = useOnlineStatus();
  const stream = useCopilotStream(encounterId);
  const queryKey = clinicalQueryKeys.caseConversation(encounterId);

  const [planError, setPlanError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [pendingRespond, setPendingRespond] = useState<PendingRespond | null>(() =>
    readPendingRespond(encounterId),
  );
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraft>(
    () => readSession<FollowUpDraft>(followUpKey(encounterId)) ?? emptyDraft(null),
  );
  // A conversa cujo plano esta tela já pediu: pedir de novo só pelo botão.
  const [plannedFor, setPlannedFor] = useState<string | null>(null);

  const fetchConversation = useCallback(
    () =>
      apiClient.get<CaseConversationResponse>(`/encounters/${encounterId}/copilot/conversation`),
    [encounterId],
  );

  const conversationQuery = useQuery({
    queryKey,
    queryFn: fetchConversation,
    refetchInterval: (query) => {
      const data = query.state.data;
      const latest = data?.turns.at(-1);
      const waitingPlan =
        !building && data?.intake?.status === "closed" && data.turns.length === 0;
      const respondElsewhere =
        pendingRespond !== null && latest?.interactionId === pendingRespond.parentInteractionId;
      if (respondElsewhere || (waitingPlan && data?.intake?.analysisInProgress)) {
        return POLL_INTERVAL_MS;
      }
      // Plano que falhou ou passou do teto: ele ainda pode chegar atrasado.
      return waitingPlan ? SLOW_POLL_INTERVAL_MS : false;
    },
  });

  const conversation = conversationQuery.data ?? null;
  const intake = conversation?.intake ?? null;
  const turns = useMemo(() => conversation?.turns ?? [], [conversation]);
  const latestTurn = turns.at(-1) ?? null;
  const maxTurns = conversation?.maxTurns ?? DEFAULT_MAX_TURNS;

  const setIntake = useCallback(
    (next: IntakeView, options: { resetTurns?: boolean } = {}) => {
      queryClient.setQueryData<CaseConversationResponse>(queryKey, (current) => ({
        intake: next,
        turns: options.resetTurns ? [] : (current?.turns ?? []),
        maxTurns: current?.maxTurns ?? DEFAULT_MAX_TURNS,
      }));
    },
    [queryClient, queryKey],
  );

  const refreshConversation = useCallback(
    () => queryClient.fetchQuery({ queryKey, queryFn: fetchConversation, staleTime: 0 }),
    [queryClient, queryKey, fetchConversation],
  );

  // ── Antes do plano ──────────────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: (input: StartCaseInput) =>
      apiClient.post<IntakeView>(`/encounters/${encounterId}/copilot/intake`, input),
    onSuccess: (next) => setIntake(next, { resetTurns: true }),
  });

  const startCase = useCallback(
    async (input: StartCaseInput): Promise<"started" | "queued" | "failed"> => {
      if (!isOnline) {
        await addToQueue({
          type: "analyze",
          encounterId,
          caseText: input.caseText,
          context: input.context,
          redFlags: input.redFlags,
        });
        toast.info(messages.capture.offlineQueued);
        return "queued";
      }
      try {
        await startMutation.mutateAsync(input);
        return "started";
      } catch {
        return "failed";
      }
    },
    [isOnline, encounterId, messages.capture.offlineQueued, startMutation],
  );

  const answerMutation = useMutation({
    mutationFn: (variables: {
      intakeId: string;
      questionId: string;
      answer: IntakeAnswerValue;
      label: string;
      channel: IntakeAnswerChannel;
    }) =>
      apiClient.post<IntakeView>(
        `/encounters/${encounterId}/copilot/intake/${variables.intakeId}/answers`,
        { questionId: variables.questionId, answer: variables.answer, channel: variables.channel },
      ),
    onSuccess: (next) => setIntake(next),
  });

  /** `true` quando a resposta foi gravada; o campo de baixo só limpa o texto aí. */
  const answerIntake = useCallback(
    async (
      questionId: string,
      answer: IntakeAnswerValue,
      label: string,
      channel: IntakeAnswerChannel,
    ): Promise<boolean> => {
      if (!intake) return false;
      if (!isOnline) {
        toast.info(copy.composer.offline);
        return false;
      }
      try {
        await answerMutation.mutateAsync({
          intakeId: intake.intakeId,
          questionId,
          answer,
          label,
          channel,
        });
        return true;
      } catch {
        return false;
      }
    },
    [intake, isOnline, copy.composer.offline, answerMutation],
  );

  const correctIntake = useCallback(
    (correction: string, channel: IntakeAnswerChannel) =>
      answerIntake(UNDERSTANDING_CORRECTION_QUESTION_ID, correction, correction, channel),
    [answerIntake],
  );

  const skipMutation = useMutation({
    mutationFn: (intakeId: string) =>
      apiClient.post<IntakeView>(`/encounters/${encounterId}/copilot/intake/${intakeId}/skip`),
    onSuccess: (next) => setIntake(next),
  });

  const skipIntake = useCallback(() => {
    if (intake?.status === "asking") skipMutation.mutate(intake.intakeId);
  }, [intake, skipMutation]);

  // ── O plano ─────────────────────────────────────────────────────────────

  /**
   * Streaming primeiro; se a conexão cair, a conversa confere o servidor
   * antes de pedir de novo — o plano pode ter saído (ou estar saindo) mesmo
   * sem a resposta ter chegado aqui.
   */
  const buildPlan = useCallback(
    async (intakeId: string) => {
      setPlannedFor(intakeId);
      setBuilding(true);
      setPlanError(null);
      try {
        await stream.startFromIntake(intakeId);
      } catch {
        try {
          const latest = await refreshConversation();
          const settledElsewhere = latest.turns.length > 0 || latest.intake?.analysisInProgress;
          if (!settledElsewhere) {
            await apiClient.post(`/encounters/${encounterId}/copilot/intake/${intakeId}/analyze`);
          }
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 409)) {
            setPlanError(errorMessage(error, copy.planFailed));
          }
        }
      } finally {
        await queryClient.invalidateQueries({ queryKey });
        setBuilding(false);
      }
      markFirstAnalysisDone();
    },
    [stream, refreshConversation, encounterId, copy.planFailed, queryClient, queryKey],
  );

  const needsPlan =
    intake?.status === "closed" &&
    turns.length === 0 &&
    !intake.analysisInProgress &&
    !intake.analysisInteractionId;

  // A conversa fechou (respostas, pulo, caso completo ou instável): o plano
  // começa sozinho, uma vez por conversa. Também cobre a volta de uma
  // interrupção entre a última resposta e o plano.
  useEffect(() => {
    if (!needsPlan || !intake || building || plannedFor === intake.intakeId) return;
    // Fora do corpo do efeito: no StrictMode a limpeza cancela o pedido
    // duplicado antes de ele sair.
    const timer = setTimeout(() => void buildPlan(intake.intakeId), 0);
    return () => clearTimeout(timer);
  }, [needsPlan, intake, building, plannedFor, buildPlan]);

  const retryPlan = useCallback(() => {
    if (intake) void buildPlan(intake.intakeId);
  }, [intake, buildPlan]);

  // ── Depois do plano ─────────────────────────────────────────────────────

  const respondMutation = useMutation({
    mutationFn: async (variables: { interactionId: string; answers: ClarifyingAnswer[] }) => {
      if (!isOnline) {
        await addToQueue({ type: "respond", encounterId, ...variables });
        return { queued: true };
      }
      const pending = { parentInteractionId: variables.interactionId, startedAt: Date.now() };
      writeSession(pendingRespondKey(encounterId), pending);
      setPendingRespond(pending);
      await apiClient.post(`/encounters/${encounterId}/copilot/respond`, variables);
      return { queued: false };
    },
    onSuccess: async ({ queued }) => {
      if (queued) {
        toast.info("Sem conexão. Resposta será enviada quando voltar online.");
        return;
      }
      writeSession(followUpKey(encounterId), null);
      setFollowUpDraft(emptyDraft(null));
      await queryClient.invalidateQueries({ queryKey });
    },
    onSettled: () => {
      writeSession(pendingRespondKey(encounterId), null);
      setPendingRespond(null);
    },
  });

  const followUpQuestions = useMemo<ConversationQuestion[]>(
    () => latestTurn?.output.clarifyingQuestions.map(fromClarifyingQuestion) ?? [],
    [latestTurn],
  );
  const draft =
    followUpDraft.interactionId === (latestTurn?.interactionId ?? null)
      ? followUpDraft
      : emptyDraft(latestTurn?.interactionId ?? null);
  const pendingFollowUp =
    draft.dismissed || respondMutation.isPending
      ? null
      : (followUpQuestions.find((question) => !(question.id in draft.answers)) ?? null);

  const saveDraft = useCallback(
    (next: FollowUpDraft) => {
      writeSession(followUpKey(encounterId), next);
      setFollowUpDraft(next);
    },
    [encounterId],
  );

  const respondWith = useCallback(
    (answers: ClarifyingAnswer[]) => {
      if (!latestTurn || answers.length === 0) return;
      respondMutation.mutate({ interactionId: latestTurn.interactionId, answers });
    },
    [latestTurn, respondMutation],
  );

  /** Responde a pergunta da vez; a última refaz o plano com todas as respostas. */
  const answerFollowUp = useCallback(
    (questionId: string, value: string | number, label: string) => {
      const next: FollowUpDraft = {
        ...draft,
        answers: { ...draft.answers, [questionId]: { value, label } },
      };
      saveDraft(next);
      const open = followUpQuestions.some((question) => !(question.id in next.answers));
      if (open) return;
      respondWith(
        Object.entries(next.answers).map(([id, answer]) => ({ questionId: id, answer: answer.value })),
      );
    },
    [draft, saveDraft, followUpQuestions, respondWith],
  );

  /** Sem resposta, só guarda as perguntas; com alguma, refaz o plano com o que já respondeu. */
  const finishFollowUps = useCallback(() => {
    const answered = Object.entries(draft.answers);
    if (answered.length === 0) {
      saveDraft({ ...draft, dismissed: true });
      return;
    }
    respondWith(answered.map(([id, answer]) => ({ questionId: id, answer: answer.value })));
  }, [draft, saveDraft, respondWith]);

  const complementCase = useCallback(
    (text: string) => respondWith([{ questionId: COMPLEMENT_QUESTION_ID, answer: text.trim() }]),
    [respondWith],
  );

  const correctUnderstanding = useCallback(
    async (correction: string): Promise<boolean> => {
      if (!latestTurn) return false;
      try {
        await respondMutation.mutateAsync({
          interactionId: latestTurn.interactionId,
          answers: [{ questionId: UNDERSTANDING_CORRECTION_QUESTION_ID, answer: correction.trim() }],
        });
        return true;
      } catch {
        return false;
      }
    },
    [latestTurn, respondMutation],
  );

  const retryRespond = useCallback(() => {
    if (respondMutation.variables) respondMutation.mutate(respondMutation.variables);
  }, [respondMutation]);

  // Reanálise pedida antes de um reload: a conversa espera a rodada nova
  // chegar (ver refetchInterval) em vez de mostrar o plano antigo como final.
  const respondElsewhere =
    pendingRespond !== null &&
    !respondMutation.isPending &&
    latestTurn?.interactionId === pendingRespond.parentInteractionId;

  // Reanálise que nunca chegou (falhou no servidor depois de um reload):
  // passado o teto, a conversa para de esperar e libera o campo.
  useEffect(() => {
    if (!pendingRespond) return;
    const remainingMs = pendingRespond.startedAt + PENDING_STALE_MS - Date.now();
    const timer = setTimeout(
      () => {
        writeSession(pendingRespondKey(encounterId), null);
        setPendingRespond(null);
      },
      Math.max(0, remainingMs),
    );
    return () => clearTimeout(timer);
  }, [pendingRespond, encounterId]);

  // Sem conexão a resposta foi para a fila; ao voltar, envia e atualiza.
  useEffect(() => {
    if (!isOnline) return;
    void syncOfflineQueue().then(({ processed }) => {
      if (processed > 0) void queryClient.invalidateQueries({ queryKey });
    });
  }, [isOnline, queryClient, queryKey]);

  // ── Estado da tela ──────────────────────────────────────────────────────

  // Plano já pedido por esta tela que não saiu e não está em andamento: falhou
  // (ou passou do teto). O médico vê o erro e o botão para tentar de novo.
  const planFailed = needsPlan && !building && plannedFor === intake?.intakeId;
  const planning =
    building || needsPlan || (intake?.analysisInProgress === true && turns.length === 0);

  const phase: ConversationPhase = conversationQuery.isPending
    ? "loading"
    : turns.length > 0
      ? "plan"
      : intake?.status === "asking"
        ? "asking"
        : planFailed
          ? "plan_failed"
          : planning
            ? "planning"
            : intake
              ? "planning"
              : "compose";

  const canRespond = latestTurn !== null && latestTurn.turnIndex < maxTurns - 1;

  return {
    phase,
    conversation,
    intake,
    turns,
    maxTurns,
    loadError: conversationQuery.error ? errorMessage(conversationQuery.error, "") : null,
    reload: () => void conversationQuery.refetch(),
    stream: { status: stream.status, understanding: stream.understanding },

    startCase,
    startingCase: startMutation.isPending,
    /** O caso que acabou de ser enviado, enquanto a leitura não volta. */
    pendingCase: startMutation.isPending ? (startMutation.variables ?? null) : null,
    startError: startMutation.error ? errorMessage(startMutation.error, messages.capture.errorAnalyze) : null,

    answerIntake,
    correctIntake,
    answeringIntake: answerMutation.isPending ? answerMutation.variables : null,
    intakeError:
      answerMutation.error || skipMutation.error
        ? errorMessage(answerMutation.error ?? skipMutation.error, messages.errors.title)
        : null,
    skipIntake,
    skippingIntake: skipMutation.isPending,

    planError: planFailed ? (planError ?? copy.planFailed) : null,
    retryPlan,

    followUps: {
      questions: followUpQuestions,
      answers: draft.answers,
      pending: pendingFollowUp,
    },
    answerFollowUp,
    finishFollowUps,
    complementCase,
    correctUnderstanding,
    rebuilding: respondMutation.isPending || respondElsewhere,
    respondError: respondMutation.error
      ? errorMessage(respondMutation.error, messages.copilot.reanalyze.errorTitle)
      : null,
    retryRespond,
    canRespond,
    isLastAllowedTurn: latestTurn !== null && latestTurn.turnIndex === maxTurns - 2,
  };
}

export type CaseConversation = ReturnType<typeof useCaseConversation>;
