import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api-client';

// PI-02 — espelha AiCostReport em src/modules/analytics/analytics.service.ts.
// Sem contrato compartilhado aqui de propósito: este endpoint segue o mesmo
// padrão local-only já usado por ProductFunnel na página de Analytics
// (analytics/funil não está em @contracts/clinical), diferente dos tipos
// clínicos centrais (Physician, EncounterSummary) que vivem lá. Fica num
// módulo do console porque a visão geral (/admin) e /admin/analytics leem o
// mesmo relatório — e compartilham o cache.
export interface CostByPhysician {
  physicianId: string;
  name: string | null;
  email: string;
  totalCost: number;
  analysesCount: number;
  reanalysisTurns: number;
  avgLatencyMs: number;
}

export interface CostByModel {
  model: string;
  totalCost: number;
  count: number;
  avgLatencyMs: number;
}

export interface CostByDay {
  date: string;
  cost: number;
}

export interface AiCostReport {
  period: { days: number; since: string; generatedAt: string };
  totals: {
    totalCost: number;
    interactionCount: number;
    encounterCount: number;
    avgCostPerCase: number | null;
    avgCostPerAnalysis: number | null;
    avgTurnsPerCase: number | null;
  };
  byPhysician: CostByPhysician[];
  byModel: CostByModel[];
  byDay: CostByDay[];
  projection: {
    projectedUsers: number;
    avgCostPerPhysicianPerMonth: number | null;
    projectedMonthlyCost: number | null;
  };
  disclaimer: string;
}

/** Valores padrão do painel de custo — a visão geral usa os mesmos (cache compartilhado). */
export const DEFAULT_COST_DAYS = 30;
export const DEFAULT_PROJECTED_USERS = 100;

/**
 * Relatório de custo de IA. `projectedUsers = null` desliga a query (valor
 * digitado ainda inválido — PI-02, ver CostPanel).
 */
export function useAiCostReport(days: number, projectedUsers: number | null) {
  return useQuery<AiCostReport, ApiError>({
    queryKey: ['ai-cost-report', days, projectedUsers],
    queryFn: () =>
      apiClient.get<AiCostReport>('/analytics/cost', {
        days: String(days),
        ...(projectedUsers ? { projectedUsers: String(projectedUsers) } : {}),
      }),
    enabled: projectedUsers !== null,
  });
}

// PI-02 — formata em BRL porque é assim que a resposta vai para os sócios
// (o custo em si é medido em USD pelo provedor de IA, mas exibir a moeda de
// referência do negócio evita um passo de conversão manual toda vez que
// alguém olha o painel). O disclaimer deixa claro que é estimativa.
export function formatCost(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
}
