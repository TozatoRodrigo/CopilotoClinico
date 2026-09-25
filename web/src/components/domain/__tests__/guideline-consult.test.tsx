import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidelineConsultSheet } from '../guideline-consult';
import type { GuidelineConsultResult } from '@/lib/types';

const consult = vi.fn();

vi.mock('@/lib/clinical-queries', () => ({
  useGuidelineConsult: (query: string) => consult(query),
  // SuggestGuidelineDialog (estado vazio) usa estes hooks.
  useSuggestGuideline: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExtractDocumentText: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CASE =
  'Paciente de 12 anos, chegou com picada de escorpião na perna, muita vermelhidão ao redor e febre de 39 graus.';

function result(overrides: Partial<GuidelineConsultResult>): GuidelineConsultResult {
  return {
    chunkId: 'c1',
    source: 'PCDT — Acidentes Escorpiônicos',
    sourceVersion: 'Portaria SECTICS/MS nº 59 - 01/08/2025',
    section: '4. DIAGNÓSTICO',
    text: '[PCDT · Acidentes Escorpiônicos · 4. DIAGNÓSTICO]\nA dor local é a manifestação mais frequente.',
    origin: 'official_unreviewed',
    documentUrl: 'https://www.gov.br/conitec/escorpionicos.pdf',
    specialty: 'toxicologia',
    similarity: 0.62,
    matchedBy: 'semantic',
    ...overrides,
  };
}

function consultReturns(results: GuidelineConsultResult[]) {
  consult.mockReturnValue({
    data: { results },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
}

/**
 * Relato do piloto (25/09/2026): consultar diretrizes tirava o médico do caso,
 * buscava pelo raciocínio do modelo, não achava nada e não havia volta.
 */
describe('GuidelineConsultSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consultReturns([]);
  });

  it('abre buscando pelo caso que o médico descreveu, não pelo raciocínio do modelo', () => {
    render(<GuidelineConsultSheet open onOpenChange={vi.fn()} caseText={CASE} />);

    expect(consult).toHaveBeenLastCalledWith(CASE);
    expect(screen.getByText(/Buscando pelo caso:/)).toBeInTheDocument();
  });

  it('mostra o documento usado na análise primeiro, com origem e link do PDF oficial', () => {
    consultReturns([
      result({
        chunkId: 'outro',
        source: 'IBCC — Anaphylaxis',
        origin: 'public',
        documentUrl: null,
        section: null,
        text: 'Adrenalina IM.',
      }),
      result({ chunkId: 'citado' }),
    ]);

    render(
      <GuidelineConsultSheet
        open
        onOpenChange={vi.fn()}
        caseText={CASE}
        citedChunkIds={['citado']}
      />,
    );

    const cards = screen.getAllByRole('article');
    expect(within(cards[0]!).getByText('Usado nesta análise')).toBeInTheDocument();
    expect(
      within(cards[0]!).getByText('Ministério da Saúde · não revisado pela equipe'),
    ).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link', { name: /Ver documento oficial/ })).toHaveAttribute(
      'href',
      'https://www.gov.br/conitec/escorpionicos.pdf',
    );
    // O cabeçalho "[PCDT · … ]" já está no card; o texto não o repete.
    expect(within(cards[0]!).queryByText(/\[PCDT ·/)).not.toBeInTheDocument();
    expect(
      within(cards[1]!).queryByRole('link', { name: /Ver documento oficial/ }),
    ).not.toBeInTheDocument();
  });

  it('refinar a busca troca a consulta; limpar volta a buscar pelo caso', async () => {
    const user = userEvent.setup();
    render(<GuidelineConsultSheet open onOpenChange={vi.fn()} caseText={CASE} />);

    await user.type(
      screen.getByLabelText('Refinar a busca nas diretrizes'),
      'soro antiescorpiônico',
    );
    await waitFor(() => expect(consult).toHaveBeenLastCalledWith('soro antiescorpiônico'));

    await user.click(screen.getByRole('button', { name: /Limpar e voltar a buscar pelo caso/ }));
    await waitFor(() => expect(consult).toHaveBeenLastCalledWith(CASE));
  });

  it('atalho de fonte citada busca pelo nome do documento', async () => {
    const user = userEvent.setup();
    render(
      <GuidelineConsultSheet
        open
        onOpenChange={vi.fn()}
        caseText={CASE}
        citedSources={['PCDT — Acidentes Escorpiônicos', 'PCDT — Acidentes Escorpiônicos']}
      />,
    );

    const shortcuts = screen.getAllByRole('button', { name: 'PCDT — Acidentes Escorpiônicos' });
    expect(shortcuts).toHaveLength(1);
    await user.click(shortcuts[0]!);
    await waitFor(() => expect(consult).toHaveBeenLastCalledWith('Acidentes Escorpiônicos'));
  });

  it("'Voltar ao caso' fecha o painel — o caso nunca é abandonado", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<GuidelineConsultSheet open onOpenChange={onOpenChange} caseText={CASE} />);

    await user.click(screen.getByRole('button', { name: 'Voltar ao caso' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sem resultado, orienta a refinar em vez de terminar em página vazia', () => {
    render(<GuidelineConsultSheet open onOpenChange={vi.fn()} caseText={CASE} />);

    expect(screen.getByText('Nenhuma diretriz próxima desta busca.')).toBeInTheDocument();
    expect(screen.getByText(/Tente um termo mais específico/)).toBeInTheDocument();
  });
});
