'use client';

/**
 * CC-801 — "Revise seu plantão": estado da revisão da semana, abertura e
 * respostas. O servidor é a fonte da verdade (a resposta certa só chega
 * depois da resposta do médico); cada mutação devolve o estado inteiro, que
 * substitui o cache.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AnswerShiftReviewQuestionRequest,
  ShiftReviewQuestionView,
  ShiftReviewState,
  ShiftReviewView,
} from '@contracts/shift-review';

export const shiftReviewQueryKey = ['shift-review', 'current'] as const;

/** Intervalo da consulta enquanto as perguntas são geradas. */
export const SHIFT_REVIEW_POLL_MS = 2_000;

export function useShiftReviewState() {
  return useQuery({
    queryKey: shiftReviewQueryKey,
    queryFn: () => apiClient.get<ShiftReviewState>('/shift-review/current'),
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' ? SHIFT_REVIEW_POLL_MS : false,
  });
}

/** Abrir a revisão gera as perguntas quando ainda não existem (idempotente no servidor). */
export function useStartShiftReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<ShiftReviewState>('/shift-review/current'),
    onSuccess: (state) => queryClient.setQueryData(shiftReviewQueryKey, state),
  });
}

export function useAnswerShiftReviewQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      ...body
    }: AnswerShiftReviewQuestionRequest & { questionId: string }) =>
      apiClient.post<ShiftReviewState>(`/shift-review/questions/${questionId}/answer`, body),
    onSuccess: (state) => queryClient.setQueryData(shiftReviewQueryKey, state),
  });
}

/** A revisão das telas que a mostram: pronta ou concluída. */
export function reviewOf(state: ShiftReviewState | undefined): ShiftReviewView | null {
  return state?.status === 'ready' || state?.status === 'completed' ? state.review : null;
}

/** A pergunta da vez: a primeira sem resposta, na ordem da revisão. */
export function nextUnanswered(review: ShiftReviewView): ShiftReviewQuestionView | null {
  return review.questions.find((question) => question.answer === null) ?? null;
}

/** A entrada do Plantão aparece quando há o que revisar (ou já está sendo preparado). */
export function shouldShowShiftReviewEntry(state: ShiftReviewState | undefined): boolean {
  return (
    state?.status === 'available' || state?.status === 'generating' || state?.status === 'ready'
  );
}
