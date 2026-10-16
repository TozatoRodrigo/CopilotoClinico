import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api-client';
import type {
  AI_CALL_REPORT_PERIODS as ContractReportPeriods,
  AiCallOutcome,
  AiCallReport,
  AiCallReportPeriod,
  AiCallRequestTrace,
  AiCallStage,
} from '@contracts/ai-calls';

// CC-004 — tipos do contrato (src/shared/contracts/ai-calls.ts), só como
// tipo: a imagem do web não leva o código da API, então os valores que a tela
// precisa são repetidos aqui e o `typeof` do contrato garante que batem.

/** Ver `AI_CALL_REPORT_PERIODS` no contrato. */
export const AI_CALL_REPORT_PERIODS: typeof ContractReportPeriods = ['24h', '7d', '30d'];

export const DEFAULT_AI_CALL_PERIOD: AiCallReportPeriod = '7d';

const STAGE_LABELS: Record<AiCallStage, string> = {
  intake_reading: 'Leitura do caso',
  understanding: 'Entendimento',
  decision: 'Decisão',
  research: 'Pesquisa web',
  verify_attach: 'Verificação com fonte',
  guideline_classification: 'Classificação de diretriz',
  review_questions: 'Revisão do plantão',
  card_draft: 'Rascunho de cartão',
  other: 'Outra',
};

/** Etapa nova que a tela ainda não conhece aparece com o nome da coluna. */
export function stageLabel(stage: string): string {
  return (STAGE_LABELS as Record<string, string | undefined>)[stage] ?? stage;
}

const OUTCOME_LABELS: Record<AiCallOutcome, string> = {
  ok: 'ok',
  refusal: 'recusa',
  truncated: 'truncada',
  error: 'erro',
  aborted: 'interrompida',
};

export function outcomeLabel(outcome: string): string {
  return (OUTCOME_LABELS as Record<string, string | undefined>)[outcome] ?? outcome;
}

/** Desfechos que contam como falha, na ordem em que aparecem na tela. */
export const FAILURE_OUTCOMES = [
  'error',
  'truncated',
  'refusal',
  'aborted',
] as const satisfies readonly AiCallOutcome[];

export function useAiCallReport(period: AiCallReportPeriod) {
  return useQuery<AiCallReport, ApiError>({
    queryKey: ['ai-call-report', period],
    queryFn: () => apiClient.get<AiCallReport>('/analytics/ai-calls', { period }),
  });
}

/** `requestId = null` desliga a busca (campo vazio). */
export function useAiCallRequestTrace(requestId: string | null) {
  return useQuery<AiCallRequestTrace, ApiError>({
    queryKey: ['ai-call-request-trace', requestId],
    queryFn: () =>
      apiClient.get<AiCallRequestTrace>(
        `/analytics/ai-calls/requests/${encodeURIComponent(requestId ?? '')}`,
      ),
    enabled: requestId !== null,
    retry: false,
  });
}

/**
 * Custo de uma chamada é fração de centavo: abaixo de US$ 0,10, até 4 casas
 * (US$ 0,0042); acima, 2. `null` = sem custo conhecido.
 */
export function formatUsd(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) < 0.1 ? 4 : 2,
  });
}

/** "850 ms" abaixo de 1 s; "12,3 s" acima. `null` = sem chamada. */
export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms.toLocaleString('pt-BR')} ms`;
  return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
