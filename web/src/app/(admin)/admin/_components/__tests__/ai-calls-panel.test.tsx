import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AiCallReport, AiCallRequestTrace } from '@contracts/ai-calls';
import { AiCallsPanel } from '../ai-calls-panel';

const apiGetMock = vi.fn();

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: { get: (...args: unknown[]) => apiGetMock(...args) },
  };
});

const { ApiError } = await import('@/lib/api-client');

function report(overrides: Partial<AiCallReport> = {}): AiCallReport {
  return {
    period: '7d',
    since: '2026-10-07T12:00:00.000Z',
    generatedAt: '2026-10-14T12:00:00.000Z',
    totals: {
      calls: 9,
      failures: 2,
      failureRate: 0.222,
      usageLimitErrors: 0,
      totalCostUsd: 0.69,
      latency: { p50Ms: 3000, p95Ms: 9600 },
    },
    analyses: { count: 5, totalCostUsd: 0.62, avgCostUsd: 0.124 },
    byStageModel: [
      {
        stage: 'decision',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        calls: 5,
        failures: 3,
        failureRate: 0.6,
        outcomes: { ok: 2, refusal: 0, truncated: 1, error: 2, aborted: 0 },
        usageLimitErrors: 0,
        totalCostUsd: 0.6,
        avgCostUsd: 0.2,
        latency: { p50Ms: 3000, p95Ms: 8800 },
      },
      {
        stage: 'understanding',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        calls: 2,
        failures: 0,
        failureRate: 0,
        outcomes: { ok: 2, refusal: 0, truncated: 0, error: 0, aborted: 0 },
        usageLimitErrors: 0,
        totalCostUsd: 0.02,
        avgCostUsd: 0.01,
        latency: { p50Ms: 850, p95Ms: 3900 },
      },
    ],
    costliestRequests: [
      {
        requestId: 'req-cara-0001',
        startedAt: '2026-10-14T11:00:00.000Z',
        calls: 2,
        failures: 0,
        stages: ['decision', 'understanding'],
        totalCostUsd: 0.3,
        totalLatencyMs: 6000,
      },
    ],
    disclaimer: 'Custo estimado pelos tokens.',
    ...overrides,
  };
}

function trace(requestId: string): AiCallRequestTrace {
  return {
    requestId,
    totalCostUsd: 0.3,
    totalLatencyMs: 6000,
    calls: [
      {
        id: 'call-1',
        createdAt: '2026-10-14T11:00:00.000Z',
        stage: 'understanding',
        profile: 'default',
        provider: 'anthropic',
        requestedModel: 'claude-sonnet-5-5',
        servedModel: 'claude-sonnet-5-5',
        effort: 'low',
        promptVersion: 'aaaaaaaaaaaa',
        promptTokens: 1200,
        completionTokens: 300,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        costUsd: 0.01,
        latencyMs: 4000,
        outcome: 'ok',
        errorType: null,
      },
      {
        id: 'call-2',
        createdAt: '2026-10-14T11:00:04.000Z',
        stage: 'decision',
        profile: 'default',
        provider: 'anthropic',
        requestedModel: 'claude-opus-5-5',
        servedModel: null,
        effort: 'high',
        promptVersion: 'bbbbbbbbbbbb',
        promptTokens: null,
        completionTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        costUsd: null,
        latencyMs: 2000,
        outcome: 'error',
        errorType: 'BadRequestError:400:usage_limit',
      },
    ],
  };
}

function respondWith({
  reportData = report(),
  traceFor = trace,
}: {
  reportData?: AiCallReport;
  traceFor?: (requestId: string) => AiCallRequestTrace | Error;
} = {}) {
  apiGetMock.mockImplementation((path: string) => {
    if (path === '/analytics/ai-calls') return Promise.resolve(reportData);
    const match = /^\/analytics\/ai-calls\/requests\/(.+)$/.exec(path);
    if (match) {
      const result = traceFor(decodeURIComponent(match[1]!));
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<AiCallsPanel />, { wrapper: Wrapper });
}

describe('Console admin — chamadas de IA por etapa e modelo (CC-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondWith();
  });

  it('abre em 7 dias com totais, custo por análise e p50/p95 por etapa e modelo', async () => {
    renderPanel();

    const table = await screen.findByRole('table', { name: 'Chamadas de IA por etapa e modelo' });
    expect(apiGetMock).toHaveBeenCalledWith('/analytics/ai-calls', { period: '7d' });

    const decisionRow = within(table).getByText('Decisão').closest('tr')!;
    expect(within(decisionRow).getByText('anthropic · claude-opus-5-5')).toBeInTheDocument();
    expect(within(decisionRow).getByText('3 s')).toBeInTheDocument();
    expect(within(decisionRow).getByText('8,8 s')).toBeInTheDocument();
    expect(within(decisionRow).getByText('3 · 60%')).toBeInTheDocument();
    expect(within(decisionRow).getByText('2 erros · 1 truncada')).toBeInTheDocument();

    const understandingRow = within(table).getByText('Entendimento').closest('tr')!;
    expect(within(understandingRow).getByText('850 ms')).toBeInTheDocument();

    expect(screen.getByText('Custo por análise completa').parentElement).toHaveTextContent(
      'US$ 0,12',
    );
    expect(screen.getByText('5 análises')).toBeInTheDocument();
    expect(screen.getByText('9,6 s')).toBeInTheDocument();
    expect(screen.getByText('p50 3 s')).toBeInTheDocument();
  });

  it('troca o período para 24 h e 30 dias', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('table', { name: 'Chamadas de IA por etapa e modelo' });

    await user.click(screen.getByRole('button', { name: '30d' }));
    await waitFor(() =>
      expect(apiGetMock).toHaveBeenLastCalledWith('/analytics/ai-calls', { period: '30d' }),
    );

    await user.click(screen.getByRole('button', { name: '24h' }));
    await waitFor(() =>
      expect(apiGetMock).toHaveBeenLastCalledWith('/analytics/ai-calls', { period: '24h' }),
    );
  });

  it('avisa quando o provedor recusou chamadas por limite de uso', async () => {
    const base = report();
    respondWith({ reportData: report({ totals: { ...base.totals, usageLimitErrors: 3 } }) });
    renderPanel();

    expect(
      await screen.findByText('Provedor recusou chamadas por limite de uso'),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 chamadas recusadas/)).toBeInTheDocument();
  });

  it('busca uma requisição pelo x-request-id e lista as chamadas dela', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('table', { name: 'Chamadas de IA por etapa e modelo' });

    await user.type(screen.getByLabelText('x-request-id'), '  req-suporte-42  ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    const table = await screen.findByRole('table', {
      name: 'Chamadas da requisição req-suporte-42',
    });
    expect(apiGetMock).toHaveBeenCalledWith('/analytics/ai-calls/requests/req-suporte-42');
    expect(within(table).getByText('1.200 → 300')).toBeInTheDocument();
    expect(within(table).getByText('BadRequestError:400:usage_limit')).toBeInTheDocument();
    expect(screen.getByText(/2 chamadas · US\$ 0,30 · 6 s somados/)).toBeInTheDocument();
  });

  it('clicar numa das requisições mais caras abre as chamadas dela', async () => {
    const user = userEvent.setup();
    renderPanel();

    const costliest = await screen.findByRole('table', {
      name: 'Requisições mais caras do período',
    });
    await user.click(within(costliest).getByText('req-cara-0001'));

    expect(
      await screen.findByRole('table', { name: 'Chamadas da requisição req-cara-0001' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('x-request-id')).toHaveValue('req-cara-0001');
  });

  it('explica o formato quando a API recusa o id', async () => {
    respondWith({ traceFor: () => new ApiError(400, 'Validation failed') });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('table', { name: 'Chamadas de IA por etapa e modelo' });

    await user.type(screen.getByLabelText('x-request-id'), "x' or 1=1");
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText(/Esse não é um x-request-id/)).toBeInTheDocument();
  });
});
