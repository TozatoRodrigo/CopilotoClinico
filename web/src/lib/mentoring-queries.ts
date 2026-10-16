'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  MENTORING_ANSWER_MAX_LENGTH as ContractAnswerMax,
  MENTORING_QUESTION_MAX_LENGTH as ContractQuestionMax,
} from '@contracts/clinical';
import type {
  AnswerMentoringRequest,
  CreateMentoringRequest,
  MentorQueueResponse,
  MentorQueueScope,
  MentorRequestDetail,
  MentoringAdminResponse,
  MentoringConfigResponse,
  MentoringNotificationsResponse,
  MentoringRequestStatus,
  MentoringRequestView,
  RateMentoringRequest,
} from '@/lib/types';

/**
 * CC-707 — mentoria em modo concierge ("Discutir com um médico da equipe").
 *
 * Tudo depende de GET /mentoring/config: com `COPILOT_MENTORING` desligada a
 * resposta é `{ enabled: false }` e nenhum componente da mentoria aparece (as
 * outras rotas nem existem: 404).
 */

/** Tetos do contrato; import só de tipo porque o build do web não empacota ../src. */
export const MENTORING_QUESTION_MAX_LENGTH: typeof ContractQuestionMax = 1000;
export const MENTORING_ANSWER_MAX_LENGTH: typeof ContractAnswerMax = 4000;

export const MENTORING_STATUS_LABEL: Record<MentoringRequestStatus, string> = {
  pending: 'Aguardando um médico da equipe',
  claimed: 'Em análise por um médico da equipe',
  answered: 'Respondido',
  cancelled: 'Cancelado',
};

export const mentoringQueryKeys = {
  config: ['mentoring', 'config'] as const,
  encounter: (encounterId: string) => ['mentoring', 'encounter', encounterId] as const,
  notifications: ['mentoring', 'notifications'] as const,
  queue: (scope: MentorQueueScope) => ['mentoring', 'queue', scope] as const,
  request: (requestId: string) => ['mentoring', 'request', requestId] as const,
  admin: (days: number) => ['mentoring', 'admin', days] as const,
};

/** Respostas novas aparecem sem recarregar; a mentoria é assíncrona, 1 min basta. */
const NOTIFICATIONS_POLL_MS = 60_000;

export function useMentoringConfig() {
  return useQuery({
    queryKey: mentoringQueryKeys.config,
    queryFn: () => apiClient.get<MentoringConfigResponse>('/mentoring/config'),
    staleTime: 5 * 60_000,
  });
}

export type EnabledMentoringConfig = Extract<MentoringConfigResponse, { enabled: true }>;

/** A configuração, só quando a mentoria está ligada (com termo e papel de mentor). */
export function asEnabledConfig(
  data: MentoringConfigResponse | undefined,
): EnabledMentoringConfig | null {
  return data?.enabled ? data : null;
}

/** Atalho: a mentoria está ligada (e o termo, carregado)? */
export function useMentoringEnabled(): EnabledMentoringConfig | null {
  return asEnabledConfig(useMentoringConfig().data);
}

// ── Quem pede ──────────────────────────────────────────────────────────────

export function useEncounterMentoring(encounterId: string, enabled: boolean) {
  return useQuery({
    queryKey: mentoringQueryKeys.encounter(encounterId),
    queryFn: () => apiClient.get<MentoringRequestView[]>(`/encounters/${encounterId}/mentoring`),
    enabled,
  });
}

export function useCreateMentoringRequest(encounterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMentoringRequest) =>
      apiClient.post<MentoringRequestView>(`/encounters/${encounterId}/mentoring`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: mentoringQueryKeys.encounter(encounterId) }),
  });
}

function useRequesterAction<TBody>(encounterId: string, path: (requestId: string) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: string; body?: TBody }) =>
      apiClient.post<MentoringRequestView>(path(requestId), body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mentoringQueryKeys.encounter(encounterId) }),
        queryClient.invalidateQueries({ queryKey: mentoringQueryKeys.notifications }),
      ]);
    },
  });
}

export function useCancelMentoringRequest(encounterId: string) {
  return useRequesterAction<never>(encounterId, (id) => `/mentoring/requests/${id}/cancel`);
}

export function useRateMentoringRequest(encounterId: string) {
  return useRequesterAction<RateMentoringRequest>(
    encounterId,
    (id) => `/mentoring/requests/${id}/rating`,
  );
}

export function useMarkMentoringAnswerSeen(encounterId: string) {
  return useRequesterAction<never>(encounterId, (id) => `/mentoring/requests/${id}/seen`);
}

/** Aviso no app: respostas que o médico ainda não abriu. */
export function useMentoringNotifications(enabled: boolean) {
  return useQuery({
    queryKey: mentoringQueryKeys.notifications,
    queryFn: () => apiClient.get<MentoringNotificationsResponse>('/mentoring/notifications'),
    enabled,
    refetchInterval: enabled ? NOTIFICATIONS_POLL_MS : false,
  });
}

// ── Mentor ─────────────────────────────────────────────────────────────────

export function useMentorQueue(scope: MentorQueueScope, enabled: boolean) {
  return useQuery({
    queryKey: mentoringQueryKeys.queue(scope),
    queryFn: () => apiClient.get<MentorQueueResponse>('/mentoring/queue', { scope }),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: enabled ? NOTIFICATIONS_POLL_MS : false,
  });
}

export function useMentorRequest(requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: mentoringQueryKeys.request(requestId),
    queryFn: () => apiClient.get<MentorRequestDetail>(`/mentoring/queue/${requestId}`),
    enabled,
  });
}

function useMentorAction<TBody>(requestId: string, action: 'claim' | 'release' | 'answer') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: TBody) =>
      apiClient.post<MentorRequestDetail>(`/mentoring/queue/${requestId}/${action}`, body),
    onSuccess: async (detail) => {
      queryClient.setQueryData(mentoringQueryKeys.request(requestId), detail);
      await queryClient.invalidateQueries({ queryKey: ['mentoring', 'queue'] });
    },
  });
}

export function useClaimMentoringRequest(requestId: string) {
  return useMentorAction<never>(requestId, 'claim');
}

export function useReleaseMentoringRequest(requestId: string) {
  return useMentorAction<never>(requestId, 'release');
}

export function useAnswerMentoringRequest(requestId: string) {
  return useMentorAction<AnswerMentoringRequest>(requestId, 'answer');
}

// ── Console ────────────────────────────────────────────────────────────────

export function useMentoringAdmin(days: number, enabled: boolean) {
  return useQuery({
    queryKey: mentoringQueryKeys.admin(days),
    queryFn: () =>
      apiClient.get<MentoringAdminResponse>('/admin/mentoring', { days: String(days) }),
    enabled,
    placeholderData: keepPreviousData,
  });
}
