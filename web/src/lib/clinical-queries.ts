"use client";

import {
  type QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  AuditQueryResponse,
  CrmVerificationItem,
  CrmVerificationStatus,
  DashboardStats,
  Document,
  EditDocumentRequest,
  EncounterDetail,
  EncountersResponse,
  GenerateDocumentRequest,
  GuidelineSourceSummary,
  PendingGuidelineChunk,
  ResolveCrmVerificationRequest,
} from "@/lib/types";

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
  encounters: (filters?: EncounterListFilters) =>
    ["encounters", filters ?? "default"] as const,
  encounter: (encounterId: string) => ["encounter", encounterId] as const,
  encounterDocuments: (encounterId: string) => ["encounter-documents", encounterId] as const,
  audit: (filters: AuditFilters, offset: number, limit: number) =>
    ["audit", filters, offset, limit] as const,
  latestInteraction: (encounterId: string) => ["latest-interaction", encounterId] as const,
  crmVerifications: (status: CrmVerificationStatus) => ["crm-verifications", status] as const,
  guidelineSources: ["guideline-sources"] as const,
  guidelinePending: ["guideline-pending"] as const,
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
      return apiClient.get<EncountersResponse>("/encounters", params);
    },
    placeholderData: keepPreviousData,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiClient.get<DashboardStats>("/encounters/stats"),
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

      if (filters.entity && filters.entity !== "_all") params.entity = filters.entity;
      if (filters.entityId) params.entityId = filters.entityId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      return apiClient.get<AuditQueryResponse>("/audit", params);
    },
    placeholderData: keepPreviousData,
  });
}

function invalidateEncounterQueries(queryClient: QueryClient, encounterId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: clinicalQueryKeys.encounter(encounterId) }),
    queryClient.invalidateQueries({ queryKey: clinicalQueryKeys.encounterDocuments(encounterId) }),
    queryClient.invalidateQueries({ queryKey: ["encounters"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
  ]);
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
    mutationFn: () => apiClient.post<Document>(`/encounters/${encounterId}/documents/${documentId}/confirm`),
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
    queryFn: () =>
      apiClient.get<CrmVerificationItem[]>("/admin/crm-verifications", { status }),
  });
}

export function useResolveCrmVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: ResolveCrmVerificationRequest;
    }) => apiClient.patch<CrmVerificationItem>(`/admin/crm-verifications/${id}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-verifications"] });
    },
  });
}

// ── Admin: Guidelines (E5) ─────────────────────────────────────────────────

export function useGuidelineSources() {
  return useQuery({
    queryKey: clinicalQueryKeys.guidelineSources,
    queryFn: () => apiClient.get<GuidelineSourceSummary[]>("/guidelines"),
  });
}

export function usePendingGuidelineChunks() {
  return useQuery({
    queryKey: clinicalQueryKeys.guidelinePending,
    queryFn: () => apiClient.get<PendingGuidelineChunk[]>("/guidelines/pending"),
  });
}
