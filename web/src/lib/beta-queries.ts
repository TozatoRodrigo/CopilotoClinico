'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptBetaTermsRequest,
  ApproveBetaWaitlistRequest,
  ApproveBetaWaitlistResponse,
  BetaActivationReport,
  BetaInviteListResponse,
  BetaInviteView,
  BetaMe,
  BetaProfile,
  BetaRegistrationStatus,
  BetaWaitlistListResponse,
  BetaWaitlistRequest,
  BetaWaitlistResponse,
  BetaWaitlistStatus,
  CreateBetaInvitesRequest,
  CreateBetaInvitesResponse,
} from '@contracts/beta';
import type { BetaWeeklyReport } from '@contracts/beta-weekly';
import { apiClient, type ApiError } from '@/lib/api-client';
import { BETA_INVITE_QUERY_PARAM } from '@/lib/beta-contract';

/**
 * CC-702 — consultas do beta por convite: cadastro (público), onboarding do
 * participante e console admin. Tipos de src/shared/contracts/beta.ts.
 */
export const betaKeys = {
  registration: (code: string) => ['beta', 'registration', code] as const,
  me: ['beta', 'me'] as const,
  invites: ['admin', 'beta', 'invites'] as const,
  waitlist: (status: BetaWaitlistStatus | 'all') => ['admin', 'beta', 'waitlist', status] as const,
  waitlistAll: ['admin', 'beta', 'waitlist'] as const,
  activation: (days: number) => ['admin', 'beta', 'activation', days] as const,
  weekly: (week: string | null) => ['admin', 'beta', 'weekly', week ?? 'current'] as const,
};

/** Link que o admin copia e envia (não há envio de e-mail no projeto). */
export function inviteLink(code: string, origin: string = window.location.origin): string {
  return `${origin}/register?${BETA_INVITE_QUERY_PARAM}=${encodeURIComponent(code)}`;
}

// ── Cadastro (público) ──────────────────────────────────────────────────────

export function useBetaRegistrationStatus(code: string) {
  return useQuery({
    queryKey: betaKeys.registration(code),
    queryFn: () =>
      apiClient.get<BetaRegistrationStatus>('/beta/registration', code ? { code } : undefined),
    staleTime: 60_000,
    retry: false,
  });
}

export function useJoinBetaWaitlist() {
  return useMutation({
    mutationFn: (body: BetaWaitlistRequest) =>
      apiClient.post<BetaWaitlistResponse>('/beta/waitlist', body),
  });
}

// ── Participante ────────────────────────────────────────────────────────────

export function useBetaMe(enabled = true) {
  return useQuery({
    queryKey: betaKeys.me,
    queryFn: () => apiClient.get<BetaMe>('/beta/me'),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAcceptBetaTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptBetaTermsRequest) => apiClient.post<BetaMe>('/beta/me/terms', body),
    onSuccess: (me) => queryClient.setQueryData(betaKeys.me, me),
  });
}

export function useSaveBetaProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BetaProfile) => apiClient.put<BetaMe>('/beta/me/profile', body),
    onSuccess: (me) => queryClient.setQueryData(betaKeys.me, me),
  });
}

// ── Console admin ───────────────────────────────────────────────────────────

export function useBetaInvites(enabled = true) {
  return useQuery({
    queryKey: betaKeys.invites,
    queryFn: () => apiClient.get<BetaInviteListResponse>('/admin/beta/invites'),
    enabled,
  });
}

export function useCreateBetaInvites() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBetaInvitesRequest) =>
      apiClient.post<CreateBetaInvitesResponse>('/admin/beta/invites', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: betaKeys.invites }),
  });
}

export function useRevokeBetaInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<BetaInviteView>(`/admin/beta/invites/${id}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: betaKeys.invites }),
  });
}

export function useBetaWaitlist(status: BetaWaitlistStatus | 'all', enabled = true) {
  return useQuery({
    queryKey: betaKeys.waitlist(status),
    queryFn: () =>
      apiClient.get<BetaWaitlistListResponse>(
        '/admin/beta/waitlist',
        status === 'all' ? undefined : { status },
      ),
    enabled,
  });
}

export function useApproveBetaWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ApproveBetaWaitlistRequest }) =>
      apiClient.post<ApproveBetaWaitlistResponse>(`/admin/beta/waitlist/${id}/approve`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: betaKeys.waitlistAll });
      void queryClient.invalidateQueries({ queryKey: betaKeys.invites });
    },
  });
}

export function useDeleteBetaWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/admin/beta/waitlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: betaKeys.waitlistAll }),
  });
}

export function useBetaActivation(days: number) {
  return useQuery({
    queryKey: betaKeys.activation(days),
    queryFn: () =>
      apiClient.get<BetaActivationReport>('/admin/beta/activation', { days: String(days) }),
  });
}

/**
 * CC-705 — painel semanal. `week = null` pede a semana corrente (o servidor
 * resolve pelo horário de Brasília); qualquer data vale pela semana que a
 * contém.
 */
export function useBetaWeekly(week: string | null) {
  return useQuery<BetaWeeklyReport, ApiError>({
    queryKey: betaKeys.weekly(week),
    queryFn: () =>
      apiClient.get<BetaWeeklyReport>('/admin/beta/weekly', week ? { week } : undefined),
  });
}
