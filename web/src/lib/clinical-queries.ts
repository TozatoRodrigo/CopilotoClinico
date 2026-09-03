'use client';

import {
  type QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AuditQueryResponse,
  CrmVerificationItem,
  CrmVerificationStatus,
  DashboardStats,
  Document,
  EditDocumentRequest,
  EncounterDetail,
  EncounterVertical,
  EncountersResponse,
  GenerateDocumentRequest,
  GuidelineSearchResult,
  GuidelineSourceSummary,
  PendingGuidelineChunk,
  CopilotFeedbackRequest,
  CopilotFeedbackResponse,
  ExtractDocumentTextRequest,
  ExtractDocumentTextResponse,
  ResolveCrmVerificationRequest,
  SuggestGuidelineRequest,
  SuggestGuidelineResponse,
} from '@/lib/types';

export interface AuditFilters {
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

export interface EncounterListFilters {
  page?: number;
  limit?: number;
  status?: string;
  vertical?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const clinicalQueryKeys = {
  encounters: (filters?: EncounterListFilters) => ['encounters', filters ?? 'default'] as const,
  encounter: (encounterId: string) => ['encounter', encounterId] as const,
  encounterDocuments: (encounterId: string) => ['encounter-documents', encounterId] as const,
  audit: (filters: AuditFilters, offset: number, limit: number) =>
    ['audit', filters, offset, limit] as const,
  latestInteraction: (encounterId: string) => ['latest-interaction', encounterId] as const,
  crmVerifications: (status: CrmVerificationStatus) => ['crm-verifications', status] as const,
  guidelineSources: ['guideline-sources'] as const,
  guidelinePending: ['guideline-pending'] as const,
  guidelineSearch: (q: string, specialty?: string) =>
    ['guideline-search', q, specialty ?? 'all'] as const,
};

export function useEncounterList(filters?: EncounterListFilters) {
  return useQuery({
    queryKey: clinicalQueryKeys.encounters(filters),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filters?.page) params.page = String(filters.page);
      if (filters?.limit) params.limit = String(filters.limit);
      if (filters?.status) params.status = filters.status;
      if (filters?.vertical) params.vertical = filters.vertical;
      if (filters?.search) params.search = filters.search;
      if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters?.dateTo) params.dateTo = filters.dateTo;
      return apiClient.get<EncountersResponse>('/encounters', params);
    },
    placeholderData: keepPreviousData,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiClient.get<DashboardStats>('/encounters/stats'),
  });
}

export function useEncounterDetail(encounterId: string) {
  return useQuery({
    queryKey: clinicalQueryKeys.encounter(encounterId),
    queryFn: () => apiClient.get<EncounterDetail>(`/encounters/${encounterId}`),
    enabled: Boolean(encounterId),
  });
}

export function useEncounterDocuments(encounterId: string) {
  return useQuery({
    queryKey: clinicalQueryKeys.encounterDocuments(encounterId),
    queryFn: () => apiClient.get<Document[]>(`/encounters/${encounterId}/documents`),
    enabled: Boolean(encounterId),
  });
}

export function useEncounterDocument(encounterId: string, documentId: string) {
  return useQuery({
    queryKey: [...clinicalQueryKeys.encounterDocuments(encounterId), documentId],
    queryFn: async () => {
      const documents = await apiClient.get<Document[]>(`/encounters/${encounterId}/documents`);
      return documents.find((document) => document.id === documentId) ?? null;
    },
    enabled: Boolean(encounterId && documentId),
  });
}

export function useAuditEntries(filters: AuditFilters, offset: number, limit: number) {
  return useQuery({
    queryKey: clinicalQueryKeys.audit(filters, offset, limit),
    queryFn: () => {
      const params: Record<string, string> = {
        limit: String(limit),
        offset: String(offset),
      };

      if (filters.entity && filters.entity !== '_all') params.entity = filters.entity;
      if (filters.entityId) params.entityId = filters.entityId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      return apiClient.get<AuditQueryResponse>('/audit', params);
    },
    placeholderData: keepPreviousData,
  });
}

function invalidateEncounterQueries(queryClient: QueryClient, encounterId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: clinicalQueryKeys.encounter(encounterId) }),
    queryClient.invalidateQueries({ queryKey: clinicalQueryKeys.encounterDocuments(encounterId) }),
    queryClient.invalidateQueries({ queryKey: ['encounters'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
  ]);
}

/**
 * Cancela um atendimento (draft ou em revisão) — PATCH status: 'cancelled'.
 * Backend bloqueia apenas atendimentos já 'finalized' (documento assinado);
 * ver EncountersService.update.
 */
export function useCancelEncounter(encounterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.patch<EncounterDetail>(`/encounters/${encounterId}`, { status: 'cancelled' }),
    onSuccess: async () => {
      await invalidateEncounterQueries(queryClient, encounterId);
    },
  });
}

/**
 * UX-04 — confirma/corrige a vertical do caso depois da captura, em vez de
 * exigi-la como campo bloqueante antes de analisar (ver encounters/new/page.tsx
 * e o chip editável em encounters/[id]/page.tsx).
 */
export function useUpdateEncounterVertical(encounterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vertical: EncounterVertical) =>
      apiClient.patch<EncounterDetail>(`/encounters/${encounterId}`, { vertical }),
    onSuccess: async () => {
      await invalidateEncounterQueries(queryClient, encounterId);
    },
  });
}

/**
 * S25-QC-01 — identifica o paciente de uma consulta rápida depois da
 * criação, "promovendo-a" para um caso do Plantão (o backend passa a
 * incluí-la em GET /encounters assim que patientRef deixa de ser null).
 */
export function useIdentifyEncounterPatient(encounterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patientRef: string) =>
      apiClient.patch<EncounterDetail>(`/encounters/${encounterId}`, { patientRef }),
    onSuccess: async () => {
      await invalidateEncounterQueries(queryClient, encounterId);
    },
  });
}

export function useGenerateDocument(encounterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: GenerateDocumentRequest) =>
      apiClient.post<Document>(`/encounters/${encounterId}/documents`, body),
    onSuccess: async () => {
      await invalidateEncounterQueries(queryClient, encounterId);
    },
  });
}

export function useConfirmDocument(encounterId: string, documentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<Document>(`/encounters/${encounterId}/documents/${documentId}/confirm`),
    onSuccess: async () => {
      await invalidateEncounterQueries(queryClient, encounterId);
      await queryClient.invalidateQueries({
        queryKey: [...clinicalQueryKeys.encounterDocuments(encounterId), documentId],
      });
    },
  });
}

export function useUpdateDocument(encounterId: string, documentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: EditDocumentRequest) =>
      apiClient.patch<Document>(`/encounters/${encounterId}/documents/${documentId}`, body),
    onSuccess: async () => {
      await invalidateEncounterQueries(queryClient, encounterId);
      await queryClient.invalidateQueries({
        queryKey: [...clinicalQueryKeys.encounterDocuments(encounterId), documentId],
      });
    },
  });
}

// ── Admin: CRM Verifications (E2) ──────────────────────────────────────────

export function useCrmVerifications(status: CrmVerificationStatus) {
  return useQuery({
    queryKey: clinicalQueryKeys.crmVerifications(status),
    queryFn: () => apiClient.get<CrmVerificationItem[]>('/admin/crm-verifications', { status }),
  });
}

export function useResolveCrmVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveCrmVerificationRequest }) =>
      apiClient.patch<CrmVerificationItem>(`/admin/crm-verifications/${id}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-verifications'] });
    },
  });
}

// ── Admin: Guidelines (E5) ─────────────────────────────────────────────────

export function useGuidelineSources() {
  return useQuery({
    queryKey: clinicalQueryKeys.guidelineSources,
    queryFn: () => apiClient.get<GuidelineSourceSummary[]>('/guidelines'),
  });
}

export function usePendingGuidelineChunks() {
  return useQuery({
    queryKey: clinicalQueryKeys.guidelinePending,
    queryFn: () => apiClient.get<PendingGuidelineChunk[]>('/guidelines/pending'),
  });
}

// S24-GUIDE-01 — antes, `enabled: query.length >= 2` significava que a
// Biblioteca nunca disparava a busca com o campo vazio, então a página
// parecia sem nenhuma diretriz até o médico digitar algo. Agora sempre
// busca (mesmo com query vazia — o backend lista tudo que está aprovado
// nesse caso); `query`/`specialty` continuam sendo apenas um filtro
// opcional, não um pré-requisito para ver algo na tela. `limit` sobe para
// 50 (teto já aplicado pelo controller) quando quem chama quer o efeito de
// "listar tudo" em vez do recorte padrão de 20.
export function useGuidelineSearch(query: string, specialty?: string, limit?: number) {
  return useQuery({
    queryKey: clinicalQueryKeys.guidelineSearch(query, specialty),
    queryFn: () => {
      const params = new URLSearchParams({ q: query });
      if (specialty) params.set('specialty', specialty);
      if (limit) params.set('limit', String(limit));
      return apiClient.get<GuidelineSearchResult[]>(`/guidelines/search?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

/**
 * F4 — sugestão de diretriz por qualquer médico autenticado.
 *
 * Origem: um médico do piloto encontrou um buraco na base (caso de dengue
 * conduzido como sepse) e não conseguiu contribuir com a diretriz — o único
 * upload existente exige papel de curador e front-matter. Quem encontra o
 * buraco é quem está no plantão.
 *
 * A sugestão entra como `pending_review`: nada chega ao retrieval sem
 * curadoria. Invalida a fila de pendentes para o curador ver na hora.
 */
/**
 * F7 — registra "esta análise foi para o cenário errado" com o rastro
 * técnico da interação. Substitui o caminho atual, que é mensagem de
 * WhatsApp dias depois, sem interactionId e sem os chunks recuperados.
 */
export function useCopilotFeedback(encounterId: string) {
  return useMutation({
    mutationFn: (input: CopilotFeedbackRequest) =>
      apiClient.post<CopilotFeedbackResponse>(
        `/encounters/${encounterId}/copilot/feedback`,
        input,
      ),
  });
}

/**
 * F4 — extrai o texto de um PDF/txt/md no servidor. Separado de
 * `useSuggestGuideline` de propósito: o médico confere e recorta o texto
 * antes de mandar para curadoria.
 */
export function useExtractDocumentText() {
  return useMutation({
    mutationFn: (input: ExtractDocumentTextRequest) =>
      apiClient.post<ExtractDocumentTextResponse>('/guidelines/extract-text', input),
  });
}

export function useSuggestGuideline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SuggestGuidelineRequest) =>
      apiClient.post<SuggestGuidelineResponse>('/guidelines/suggest', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clinicalQueryKeys.guidelinePending });
    },
  });
}

export function useApproveGuidelineChunk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chunkId: string) => apiClient.post(`/guidelines/chunks/${chunkId}/approve`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clinicalQueryKeys.guidelinePending,
      });
      await queryClient.invalidateQueries({
        queryKey: clinicalQueryKeys.guidelineSources,
      });
    },
  });
}

export function useRejectGuidelineChunk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chunkId, reason }: { chunkId: string; reason?: string }) =>
      apiClient.post(`/guidelines/chunks/${chunkId}/reject`, { reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clinicalQueryKeys.guidelinePending,
      });
    },
  });
}
