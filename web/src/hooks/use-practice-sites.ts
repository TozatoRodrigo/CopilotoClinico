'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PracticeSite, PracticeSiteInput } from '@/lib/types';

/** CC-602 — locais de plantão do médico (Configurações → Locais de plantão). */

const PATH = '/physicians/me/practice-sites';

export const practiceSiteKeys = {
  all: ['practice-sites'] as const,
};

export function usePracticeSites() {
  return useQuery({
    queryKey: practiceSiteKeys.all,
    queryFn: () => apiClient.get<PracticeSite[]>(PATH),
    // Muda pouco: o caso novo não precisa buscar de novo a cada abertura.
    staleTime: 5 * 60_000,
  });
}

/** Cria (sem `id`) ou substitui um local. Trocar o padrão mexe em outro local: a lista é relida. */
export function useSavePracticeSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PracticeSiteInput }) =>
      id
        ? apiClient.put<PracticeSite>(`${PATH}/${id}`, input)
        : apiClient.post<PracticeSite>(PATH, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: practiceSiteKeys.all }),
  });
}

export function useDeletePracticeSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: practiceSiteKeys.all }),
  });
}
