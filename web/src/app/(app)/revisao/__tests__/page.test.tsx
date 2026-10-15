import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KnowledgeCardReviewQueue } from '@contracts/knowledge-card-review';
import CardReviewPage from '../page';
import { reviewClock } from '../_lib/review-timer';
import {
  CARD_ID,
  cardDetail,
  correctedItem,
  CROSS_REVIEW_ID,
  crossReviewItem,
  divergedItem,
  DOSE_QUOTE,
  NEXT_CARD_ID,
  reviewItem,
  versionView,
} from './fixtures';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      post: (...args: unknown[]) => apiPostMock(...args),
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const authState = {
  physician: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Dr. Luiz',
    email: 'luiz@example.com',
    crmUf: 'SP',
    crmNumber: '123456',
    crmVerified: true,
    role: 'PHYSICIAN',
    isCardReviewer: true,
  },
};
vi.mock('@/lib/auth-store', () => ({ useAuth: () => authState }));

const { ApiError } = await import('@/lib/api-client');

const QUESTION = 'Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?';
const NEXT_QUESTION = 'Quando adiar a punção lombar na suspeita de meningite?';

function queue(
  item: KnowledgeCardReviewQueue['item'] = reviewItem(),
  pending: number | KnowledgeCardReviewQueue['pending'] = 2,
): KnowledgeCardReviewQueue {
  return {
    item,
    pending: typeof pending === 'number' ? { review: pending, crossReview: 0 } : pending,
  };
}

function nextCardQueue(): KnowledgeCardReviewQueue {
  const content = versionView(1).content;
  content.question = NEXT_QUESTION;
  return queue(
    reviewItem(cardDetail({ id: NEXT_CARD_ID, versions: [versionView(1, { content })] })),
    1,
  );
}

let clock = 0;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<CardReviewPage />, { wrapper: Wrapper });
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function decisionButton(name: RegExp) {
  const group = await screen.findByRole('group', { name: 'Decisão sobre o cartão' });
  return within(group).getByRole('button', { name });
}

beforeEach(() => {
  clock = 0;
  vi.spyOn(reviewClock, 'now').mockImplementation(() => clock);
  apiGetMock.mockReset().mockResolvedValue(queue());
  apiPostMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('Revisão de cartões (CC-404)', () => {
  it('mostra um cartão por vez com fontes e as três decisões', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: QUESTION })).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/review/knowledge-cards/next', undefined);
    expect(screen.getByText('2 cartões na fila')).toBeInTheDocument();
    expect(screen.getByText(/Ceftriaxona 2 g IV a cada 12 horas/)).toBeInTheDocument();
    expect(screen.getByText('Dose estruturada')).toBeInTheDocument();
    expect(screen.getByText('4 g/dia')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fontes' })).toBeInTheDocument();

    for (const name of [/Aprovar/, /Corrigir/, /Descartar/]) {
      expect(await decisionButton(name)).toBeEnabled();
    }
  });

  it('abre o texto da fonte com o trecho citado marcado', async () => {
    const user = userEvent.setup();
    renderPage();

    const [goToSource] = await screen.findAllByRole('button', {
      name: 'Ver no texto da fonte S1',
    });
    await user.click(goToSource!);

    const marks = document.querySelectorAll('mark');
    expect([...marks].map((mark) => mark.textContent)).toContain(DOSE_QUOTE);
    expect(screen.getAllByText(/Abrir o documento original/)[0]).toHaveAttribute(
      'href',
      'https://www.gov.br/conitec/pcdt-meningite.pdf',
    );
  });

  it('avisa quando o texto da fonte mudou depois da citação', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      (await screen.findAllByRole('button', { name: 'Ver no texto da fonte S2' }))[0]!,
    );

    expect(
      screen.getByText(/O texto desta fonte mudou depois que o cartão foi escrito/),
    ).toBeVisible();
  });

  it('aprova com validade, mede o tempo visível e passa ao próximo cartão', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValueOnce(queue()).mockResolvedValueOnce(nextCardQueue());
    apiPostMock.mockResolvedValue(
      cardDetail({
        status: 'published',
        published: {
          version: 1,
          reviewer: { ...authState.physician, id: authState.physician.id },
          reviewedAt: '2026-10-15T12:05:00.000Z',
          validUntil: '2028-10-15T12:05:00.000Z',
        },
      }),
    );
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });

    // 30 s lendo, 60 s com o celular bloqueado, mais 10 s para decidir.
    clock = 30_000;
    setVisibility('hidden');
    clock = 90_000;
    setVisibility('visible');
    clock = 100_000;

    await user.click(await decisionButton(/Aprovar/));
    const dialog = await screen.findByRole('dialog', { name: 'Aprovar a versão 1' });
    expect(within(dialog).getByText(/Dr\. Luiz · CRM-SP 123456/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: '24 meses' }));
    await user.click(within(dialog).getByRole('button', { name: /Aprovar e publicar/ }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/review/knowledge-cards/${CARD_ID}/approve`, {
        version: 1,
        validityMonths: 24,
        reviewDurationMs: 40_000,
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Cartão aprovado e publicado. Vale até 15/10/2028.',
    );
    const next = await screen.findByRole('heading', { level: 2, name: NEXT_QUESTION });
    await waitFor(() => expect(next).toHaveFocus());
  });

  it('descartar exige motivo e envia o tempo de revisão', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValueOnce(queue()).mockResolvedValueOnce(nextCardQueue());
    apiPostMock.mockResolvedValue(cardDetail({ status: 'archived' }));
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });
    clock = 12_000;

    await user.click(await decisionButton(/Descartar/));
    const dialog = await screen.findByRole('dialog', { name: 'Descartar o cartão' });
    await user.click(within(dialog).getByRole('button', { name: /^Descartar$/ }));

    expect(within(dialog).getByText('Escreva o motivo do descarte.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');
    expect(apiPostMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('radio', { name: /Dose errada ou sem fonte/ }));
    await user.click(within(dialog).getByRole('button', { name: /^Descartar$/ }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/review/knowledge-cards/${CARD_ID}/reject`, {
        version: 1,
        reason: 'Dose errada ou sem fonte',
        reviewDurationMs: 12_000,
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith('Cartão descartado.');
  });

  it('corrigir salva a versão nova e mostra o que mudou', async () => {
    const user = userEvent.setup();
    const newAnswer =
      'Ceftriaxona 2 g IV a cada 12 horas, logo após a coleta do líquor e sem esperar a cultura.';
    apiPostMock.mockResolvedValueOnce(correctedItem(newAnswer));
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });

    await user.click(await decisionButton(/Corrigir/));
    expect(screen.getByRole('heading', { name: 'Corrigir a versão 1' })).toBeInTheDocument();
    const answer = screen.getByLabelText('Resposta');
    await user.clear(answer);
    await user.type(answer, newAnswer);
    await user.click(screen.getByRole('button', { name: /Salvar correção/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));
    const [path, body] = apiPostMock.mock.calls[0]!;
    expect(path).toBe(`/review/knowledge-cards/${CARD_ID}/versions`);
    expect(body.basedOnVersion).toBe(1);
    expect(body.content.answer).toBe(newAnswer);
    expect(body.content.sources).toEqual([
      { key: 'S1', chunkId: '11111111-1111-4111-8111-111111111111' },
      { key: 'S2', chunkId: '22222222-2222-4222-8222-222222222222' },
    ]);

    const diff = await screen.findByRole('list', { name: 'Mudanças da correção' });
    expect(within(diff).getByText('Resposta')).toBeInTheDocument();
    expect(diff.querySelector('del')?.textContent).toContain('iniciada');
    expect(diff.querySelector('ins')?.textContent).toContain('sem esperar a cultura');
    expect(screen.getByText('Versão 2')).toBeInTheDocument();
    expect(screen.getByText('Correção de Dr. Luiz')).toBeInTheDocument();

    apiPostMock.mockResolvedValueOnce(cardDetail());
    await user.click(await decisionButton(/Aprovar/));
    expect(await screen.findByRole('dialog', { name: 'Aprovar a versão 2' })).toBeInTheDocument();
  });

  it('mostra no campo o problema de citação que a API devolveu', async () => {
    const user = userEvent.setup();
    apiPostMock.mockRejectedValueOnce(
      new ApiError(422, 'O conteúdo não pode ser gravado', {
        message: 'O conteúdo não pode ser gravado',
        issues: [
          {
            path: 'claims[0].dose.amount',
            message: 'dose sem fonte: "4 g" não está no trecho citado da dose',
          },
        ],
      }),
    );
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });

    await user.click(await decisionButton(/Corrigir/));
    const amount = screen.getByLabelText('Dose (como a fonte escreve)');
    await user.clear(amount);
    await user.type(amount, '4 g');
    await user.click(screen.getByRole('button', { name: /Salvar correção/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A correção não foi gravada');
    expect(alert).toHaveTextContent('Afirmação 1 · dose · quantidade');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription(
      'dose sem fonte: "4 g" não está no trecho citado da dose',
    );
  });

  it('outro revisor decidiu antes: avisa e carrega o próximo', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValueOnce(queue()).mockResolvedValueOnce(nextCardQueue());
    apiPostMock.mockRejectedValueOnce(new ApiError(409, 'Este cartão já saiu da fila de revisão'));
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });

    await user.click(await decisionButton(/Aprovar/));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /Aprovar e publicar/ }),
    );

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Este cartão já saiu da fila de revisão'),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: NEXT_QUESTION }),
    ).toBeInTheDocument();
  });

  it('pular deixa o cartão para depois', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValueOnce(queue()).mockResolvedValueOnce(nextCardQueue());
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });

    await user.click(screen.getByRole('button', { name: /Pular/ }));

    await screen.findByRole('heading', { level: 2, name: NEXT_QUESTION });
    expect(apiGetMock).toHaveBeenLastCalledWith('/review/knowledge-cards/next', { skip: CARD_ID });
  });

  it('fila vazia', async () => {
    apiGetMock.mockResolvedValue(queue(null, 0));
    renderPage();

    expect(await screen.findByText('Fila zerada')).toBeInTheDocument();
  });

  it('quem não é revisor vê o motivo, sem cartão', async () => {
    apiGetMock.mockRejectedValue(
      new ApiError(403, 'Apenas revisores de cartões podem acessar esta fila'),
    );
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sem acesso à fila de revisão');
    expect(alert).toHaveTextContent('Apenas revisores de cartões podem acessar esta fila');
    expect(screen.queryByRole('group', { name: 'Decisão sobre o cartão' })).toBeNull();
  });
});

describe('Revisão cruzada (CC-411)', () => {
  async function crossDecisionButton(name: RegExp) {
    const group = await screen.findByRole('group', { name: 'Decisão da revisão cruzada' });
    return within(group).getByRole('button', { name });
  }

  beforeEach(() => {
    apiGetMock
      .mockReset()
      .mockResolvedValueOnce(queue(crossReviewItem(), { review: 2, crossReview: 1 }))
      .mockResolvedValueOnce(nextCardQueue());
  });

  it('mostra a aprovação sorteada antes da fila, com quem aprovou', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: QUESTION })).toBeInTheDocument();
    expect(screen.getByText('2 cartões na fila · 1 revisão cruzada')).toBeInTheDocument();
    expect(screen.getByText('Revisão cruzada')).toBeInTheDocument();
    expect(screen.getByText(/Aprovado por Dra\. Ana em 10\/10\/2026/)).toBeInTheDocument();
    expect(await crossDecisionButton(/Concordo/)).toBeEnabled();
    expect(await crossDecisionButton(/Divergir/)).toBeEnabled();
    expect(screen.queryByRole('group', { name: 'Decisão sobre o cartão' })).toBeNull();
  });

  it('concordar registra o tempo de revisão e passa ao próximo', async () => {
    const user = userEvent.setup();
    apiPostMock.mockResolvedValue(cardDetail({ status: 'published' }));
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });
    clock = 75_000;

    await user.click(await crossDecisionButton(/Concordo/));
    const dialog = await screen.findByRole('dialog', { name: 'Concordar com a versão 1' });
    await user.click(within(dialog).getByRole('button', { name: /^Concordo$/ }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        `/review/knowledge-cards/cross-reviews/${CROSS_REVIEW_ID}/agree`,
        { reviewDurationMs: 75_000 },
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: NEXT_QUESTION }),
    ).toBeInTheDocument();
  });

  it('divergir exige o motivo e manda a correção', async () => {
    const user = userEvent.setup();
    apiPostMock.mockResolvedValue(cardDetail());
    renderPage();
    await screen.findByRole('heading', { level: 2, name: QUESTION });
    clock = 130_000;

    await user.click(await crossDecisionButton(/Divergir/));
    expect(screen.getByRole('heading', { name: 'Divergir da versão 1' })).toBeInTheDocument();
    const maxDose = screen.getByLabelText('Dose máxima (opcional)');
    await user.clear(maxDose);
    await user.click(screen.getByRole('button', { name: /Divergir e tirar do ar/ }));

    const reason = screen.getByLabelText('O que está errado');
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveFocus();
    expect(apiPostMock).not.toHaveBeenCalled();

    await user.type(reason, 'A dose máxima não vale para esta população');
    await user.click(screen.getByRole('button', { name: /Divergir e tirar do ar/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));
    const [path, body] = apiPostMock.mock.calls[0]!;
    expect(path).toBe(`/review/knowledge-cards/cross-reviews/${CROSS_REVIEW_ID}/diverge`);
    expect(body).toMatchObject({
      reason: 'A dose máxima não vale para esta população',
      reviewDurationMs: 130_000,
      basedOnVersion: 1,
    });
    expect(body.content.claims[0].dose.maxDose).toBeNull();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Divergência registrada. O cartão saiu do ar e voltou para a fila com a sua correção.',
    );
  });

  it('cartão que voltou por divergência mostra de quem e por quê', async () => {
    apiGetMock.mockReset().mockResolvedValue(queue(divergedItem(), 1));
    renderPage();

    expect(await screen.findByText('Voltou à fila pela revisão cruzada')).toBeInTheDocument();
    expect(
      screen.getByText(/Dr\. Luiz divergiu da versão 1, aprovada por Dra\. Ana/),
    ).toHaveTextContent('A dose máxima não aparecia na resposta');
  });
});
