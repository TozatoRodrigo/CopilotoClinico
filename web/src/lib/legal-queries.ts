'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptLegalDocumentsRequest,
  LegalAdminOverview,
  LegalDocumentView,
  LegalStatus,
  PublishLegalDocumentRequest,
} from '@contracts/legal';
import { apiClient } from '@/lib/api-client';

/**
 * CC-905 — termos de uso e política de privacidade: o que falta o médico
 * aceitar, o aceite e o console admin. Tipos de src/shared/contracts/legal.ts.
 */
export const legalKeys = {
  status: ['legal', 'status'] as const,
  adminOverview: ['admin', 'legal', 'documents'] as const,
};

export function useLegalStatus(enabled = true) {
  return useQuery({
    queryKey: legalKeys.status,
    queryFn: () => apiClient.get<LegalStatus>('/legal/status'),
    enabled,
    // Uma consulta por sessão basta: a API recusa com 428 qualquer rota de
    // quem ficou pendente depois (versão nova publicada no meio da sessão).
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAcceptLegalDocuments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptLegalDocumentsRequest) =>
      apiClient.post<LegalStatus>('/legal/acceptances', body),
    onSuccess: (status) => queryClient.setQueryData(legalKeys.status, status),
  });
}

export function useLegalAdminOverview() {
  return useQuery({
    queryKey: legalKeys.adminOverview,
    queryFn: () => apiClient.get<LegalAdminOverview>('/admin/legal/documents'),
  });
}

export function usePublishLegalDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PublishLegalDocumentRequest) =>
      apiClient.post<LegalDocumentView>('/admin/legal/documents', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: legalKeys.adminOverview });
      // Quem publicou também passa a ter a versão nova pendente.
      void queryClient.invalidateQueries({ queryKey: legalKeys.status });
    },
  });
}
