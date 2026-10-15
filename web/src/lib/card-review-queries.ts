'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiClient } from '@/lib/api-client';
import type {
  CreateKnowledgeCardVersionRequest,
  KnowledgeCardDetail,
} from '@contracts/knowledge-cards';
import type {
  KnowledgeCardReviewItem,
  KnowledgeCardReviewQueue,
  ReviewApproveKnowledgeCardRequest,
  ReviewRejectKnowledgeCardRequest,
} from '@contracts/knowledge-card-review';

/** CC-404 — fila de revisão de cartões (`/v1/review/knowledge-cards`). */

export const cardReviewQueryKeys = {
  all: ['card-review'] as const,
  next: (skip: readonly string[]) => ['card-review', 'next', [...skip]] as const,
};

export function useCardReviewQueue(skip: readonly string[]) {
  return useQuery({
    queryKey: cardReviewQueryKeys.next(skip),
    queryFn: () =>
      apiClient.get<KnowledgeCardReviewQueue>(
        '/review/knowledge-cards/next',
        skip.length > 0 ? { skip: skip.join(',') } : undefined,
      ),
    // O cartão na tela não troca sozinho (foco, reconexão, cache velho): só
    // depois de uma decisão ou de "pular".
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // 403 (não é revisor, CRM não verificado) não melhora tentando de novo.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status < 500) && failureCount < 1,
  });
}

export function useCorrectCard(cardId: string) {
  return useMutation({
    mutationFn: (body: CreateKnowledgeCardVersionRequest) =>
      apiClient.post<KnowledgeCardReviewItem>(`/review/knowledge-cards/${cardId}/versions`, body),
  });
}

export function useApproveCard(cardId: string) {
  return useMutation({
    mutationFn: (body: ReviewApproveKnowledgeCardRequest) =>
      apiClient.post<KnowledgeCardDetail>(`/review/knowledge-cards/${cardId}/approve`, body),
  });
}

export function useRejectCard(cardId: string) {
  return useMutation({
    mutationFn: (body: ReviewRejectKnowledgeCardRequest) =>
      apiClient.post<KnowledgeCardDetail>(`/review/knowledge-cards/${cardId}/reject`, body),
  });
}
