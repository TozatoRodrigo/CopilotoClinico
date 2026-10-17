import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KnowledgeCardCrossReviewSummary } from '@contracts/knowledge-card-review';
import CrossReviewAgreementPage from '../page';

const apiGetMock = vi.fn();

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiClient: { get: (...args: unknown[]) => apiGetMock(...args) } };
});

const { ApiError } = await import('@/lib/api-client');

const ANA = { id: 'a', name: 'Dra. Ana', crmUf: 'RJ', crmNumber: '654321', crmVerified: true };
const LUIZ = { id: 'l', name: 'Dr. Luiz', crmUf: 'SP', crmNumber: '123456', crmVerified: true };

function summary(
  overrides: Partial<KnowledgeCardCrossReviewSummary> = {},
): KnowledgeCardCrossReviewSummary {
  return {
    samplePercent: 10,
    approvals: 230,
    sampled: 23,
    pending: 2,
    superseded: 1,
    agreed: 19,
    diverged: 1,
    agreementRate: 0.95,
    divergenceRate: 0.05,
    divergenceTarget: 0.05,
    reviewTime: { decisions: 180, medianMs: 270_000 },
    recentDivergences: [
      {
        crossReviewId: 'x',
        cardId: 'c',
        topic: 'Meningite bacteriana',
        question: 'Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?',
        cardStatus: 'in_review',
        disputedVersion: 1,
        correctionVersion: 2,
        firstReviewer: ANA,
        crossReviewer: LUIZ,
        reason: 'A dose máxima não aparecia na resposta',
        reviewedAt: '2026-10-14T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<CrossReviewAgreementPage />, { wrapper: Wrapper });
}

describe('Painel da revisão cruzada (CC-411)', () => {
  beforeEach(() => {
    apiGetMock.mockReset().mockResolvedValue(summary());
  });

  it('mostra concordância, divergência contra a meta, pendentes e o tempo de revisão', async () => {
    renderPage();

    expect(await screen.findByText('95%')).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/review/knowledge-cards/cross-reviews/summary');
    expect(screen.getByText('19 de 20 revisões cruzadas')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('Fora da meta: abaixo de 5%')).toBeInTheDocument();
    expect(screen.getByText('1 saiu do ar antes da revisão')).toBeInTheDocument();
    expect(screen.getByText('4 min 30 s')).toBeInTheDocument();
    expect(screen.getByText('230 aprovações · 23 sorteadas (10%)')).toBeInTheDocument();
  });

  it('lista as divergências recentes com quem aprovou, quem divergiu e o motivo', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Divergências recentes' });
    const [item] = within(list).getAllByRole('listitem');
    expect(item).toHaveTextContent('Na fila de revisão');
    expect(item).toHaveTextContent(
      'Versão 1 aprovada por Dra. Ana; Dr. Luiz divergiu e corrigiu (versão 2).',
    );
    expect(item).toHaveTextContent('“A dose máxima não aparecia na resposta”');
  });

  it('sem revisão cruzada feita, explica de onde elas vêm', async () => {
    apiGetMock.mockResolvedValue(
      summary({
        sampled: 0,
        pending: 0,
        superseded: 0,
        agreed: 0,
        diverged: 0,
        agreementRate: null,
        divergenceRate: null,
        reviewTime: { decisions: 0, medianMs: null },
        recentDivergences: [],
      }),
    );
    renderPage();

    expect(await screen.findByText('Nenhuma revisão cruzada feita ainda')).toBeInTheDocument();
    expect(screen.getByText('Meta: abaixo de 5%')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('mostra o erro de acesso', async () => {
    apiGetMock.mockRejectedValue(
      new ApiError(403, 'Apenas revisores de cartões podem acessar esta fila'),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Apenas revisores de cartões podem acessar esta fila',
    );
  });
});
