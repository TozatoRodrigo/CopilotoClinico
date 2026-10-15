import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteBreadcrumbs } from '@/components/layout/route-breadcrumbs';
import BloqueioPage, { generateStaticParams } from '../[id]/page';
import { BlockDetailScreen } from '../_components/block-detail';
import { BlockListScreen, TopographyScreen } from '../_components/block-lists';
import { readToolSession, TOOL_SESSION_TTL_MS, writeToolSession } from '@/lib/tool-session';
import { BlocksHome } from '../_components/blocks-home';
import { LastScreen, MaxDoseScreen } from '../_components/dose-screens';
import {
  draftToForm,
  EMPTY_EVOLUTION_DRAFT,
  parseEvolutionDraft,
} from '../_components/evolution-draft';
import { EvolutionScreen } from '../_components/evolution-screen';

const navigation = vi.hoisted(() => ({
  pathname: '/ferramentas/bloqueios',
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => navigation.notFound(),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/clinical-queries', () => ({
  useEncounterDetail: () => ({ data: undefined }),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), info: vi.fn() },
}));

const WEIGHT_KEY = 'copiloto:ferramentas:sessao:peso-adulto';

function storeWeight(value: string, savedAt = Date.now()) {
  window.sessionStorage.setItem(WEIGHT_KEY, JSON.stringify({ savedAt, value }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  toastSuccess.mockClear();
});

describe('/ferramentas/bloqueios (CC-330)', () => {
  it('abre nas cinco seções do BlockPath, com o aviso fixo e favorito', () => {
    render(<BlocksHome />);

    expect(screen.getByRole('heading', { level: 1, name: 'Bloqueios regionais' })).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent('Apoio à decisão');
    const sections = within(screen.getByRole('navigation', { name: 'Seções dos bloqueios' }));
    expect(sections.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/ferramentas/bloqueios/topografia',
      '/ferramentas/bloqueios/lista',
      '/ferramentas/bloqueios/dose-maxima',
      '/ferramentas/bloqueios/last',
      '/ferramentas/bloqueios/evolucao',
    ]);
    expect(sections.getByRole('link', { name: /LAST/ })).toHaveTextContent('Emergência');
    expect(screen.getByRole('button', { name: 'Favoritar Bloqueios regionais' })).toBeVisible();
  });

  it('escolhe pela lesão: 14 caminhos até a ficha do bloqueio', () => {
    render(<TopographyScreen />);

    const paths = screen
      .getAllByRole('region')
      .flatMap((region) => within(region).getAllByRole('link'));
    expect(paths).toHaveLength(14);
    expect(screen.getByRole('link', { name: /Quadril, fêmur proximal/ })).toHaveAttribute(
      'href',
      '/ferramentas/bloqueios/peng',
    );
    expect(screen.getByRole('link', { name: /Fraturas costelas \(lateral\)/ })).toHaveTextContent(
      'Serrátil anterior',
    );
  });

  it('lista os 14 bloqueios por região, com o volume', () => {
    render(<BlockListScreen />);

    expect(screen.getAllByRole('region')).toHaveLength(4);
    const thorax = screen.getByRole('region', { name: 'Tórax' });
    expect(within(thorax).getByRole('link', { name: /Intercostal/ })).toHaveTextContent(
      '3-5 mL/nível',
    );
  });

  it('mostra a ficha do bloqueio com técnica em passos e a tabela de anestésico', async () => {
    render(<BlockDetailScreen id="peng" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Bloqueio PENG' })).toBeVisible();
    expect(screen.getByText('Quadril · 15-20 mL · Sensitivo')).toBeVisible();
    expect(screen.getByText('Preserva função motora do quadríceps.')).toBeVisible();
    const technique = screen.getByRole('region', { name: 'Técnica' });
    expect(within(technique).getAllByRole('listitem')).toHaveLength(8);
    const table = within(screen.getByRole('region', { name: 'Anestésico local' }));
    expect(table.getByRole('row', { name: /Bupivacaína 0,25-0,5% 15-20 mL/ })).toBeVisible();

    const material = within(screen.getByRole('region', { name: 'Material' }));
    const gloves = material.getByRole('checkbox', { name: 'Luvas estéreis' });
    await userEvent.click(gloves);
    expect(gloves).toBeChecked();
  });

  it('pré-renderiza as 14 fichas e responde 404 para id desconhecido', async () => {
    expect(generateStaticParams()).toHaveLength(14);
    await expect(BloqueioPage({ params: Promise.resolve({ id: 'xyz' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});

describe('dose máxima (CC-330)', () => {
  it('sem peso, não mostra dose e não deixa copiar', () => {
    render(<MaxDoseScreen />);

    expect(screen.getByRole('status')).toHaveTextContent('Informe o peso (40 a 200 kg)');
    expect(screen.queryByText(/\d+ mg$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar para o prontuário' })).toBeDisabled();
  });

  it('com 70 kg mostra mg e mL de cada concentração, e guarda o peso na aba', async () => {
    render(<MaxDoseScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: /Peso/ }), '70');

    expect(screen.getByRole('status')).toHaveTextContent('Calculado para 70 kg.');
    const lidocaine = within(screen.getByRole('region', { name: 'Lidocaína' }));
    expect(lidocaine.getByText('315 mg')).toBeVisible();
    expect(lidocaine.getByText('490 mg')).toBeVisible();
    expect(lidocaine.getByRole('row', { name: '2% 15,8 mL 24,5 mL' })).toBeVisible();
    const ropivacaine = within(screen.getByRole('region', { name: 'Ropivacaína' }));
    expect(ropivacaine.getByRole('row', { name: '0,2% 105,0 mL 122,5 mL' })).toBeVisible();

    const stored = JSON.parse(window.sessionStorage.getItem(WEIGHT_KEY) ?? 'null');
    expect(stored).toMatchObject({ value: '70' });
    expect(typeof stored.savedAt).toBe('number');
  });

  it('peso fora da faixa é erro e não calcula', async () => {
    render(<MaxDoseScreen />);

    await userEvent.type(screen.getByRole('textbox', { name: /Peso/ }), '250');

    expect(screen.getByText('Fora da faixa aceita: 40 a 200 kg.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Corrija o peso');
    expect(screen.queryByRole('region', { name: 'Lidocaína' })).not.toBeInTheDocument();
  });

  it('usa o peso adulto já informado em outra ferramenta e copia o texto', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    storeWeight('80');
    render(<MaxDoseScreen />);

    expect(screen.getByRole('textbox', { name: /Peso/ })).toHaveValue('80');
    expect(
      within(screen.getByRole('region', { name: 'Lidocaína' })).getByText('360 mg'),
    ).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Copiar para o prontuário' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Dose máxima de anestésico local (peso 80 kg):'),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('peso salvo há mais de 30 minutos não volta', () => {
    storeWeight('80', Date.now() - TOOL_SESSION_TTL_MS - 1000);
    render(<MaxDoseScreen />);

    expect(screen.getByRole('textbox', { name: /Peso/ })).toHaveValue('');
  });
});

describe('LAST (CC-330)', () => {
  it('mostra os sinais, os cinco passos e a emulsão lipídica pelo peso', async () => {
    render(<LastScreen />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'LAST — Intoxicação por AL' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Passos' })).getAllByRole('listitem'),
    ).toHaveLength(5);

    await userEvent.type(screen.getByRole('textbox', { name: /Peso/ }), '70');

    const lipid = within(screen.getByRole('region', { name: 'Emulsão lipídica 20%' }));
    expect(lipid.getByText('Bolus (1,5 mL/kg)').nextSibling).toHaveTextContent('105 mL');
    expect(lipid.getByText('Infusão (0,25 mL/kg/min)').nextSibling).toHaveTextContent(
      '17,5 mL/min',
    );
    expect(lipid.getByText('Dose máxima (12 mL/kg)').nextSibling).toHaveTextContent('840 mL');
  });
});

describe('nota de evolução (CC-330)', () => {
  function preview(): string {
    return (
      screen.getByRole('region', { name: 'Texto da evolução' }).querySelector('pre')?.textContent ??
      ''
    );
  }

  it('monta o texto ao vivo, com vírgula decimal e avaliação conferível', async () => {
    render(<EvolutionScreen />);
    expect(preview()).toContain('Bloqueio: -- ');
    expect(preview()).toContain('- Ausência de sinais de LAST');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo de bloqueio' }),
      'PENG',
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Direito' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Volume/ }), '20,5');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sem sinais de LAST' }));

    expect(preview()).toContain('Bloqueio: PENG (D)');
    expect(preview()).toContain('Volume: 20,5 mL | Dose: -- mg');
    expect(preview()).toContain('- ATENÇÃO: sinais de LAST');
  });

  it('pede a descrição da intercorrência e limpa o formulário', async () => {
    render(<EvolutionScreen />);
    const complications = within(screen.getByRole('group', { name: 'Intercorrências' }));

    await userEvent.click(complications.getByRole('radio', { name: 'Sim' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Descreva a intercorrência' }),
      'Punção vascular',
    );
    expect(preview()).toContain('Intercorrências: Punção vascular');

    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(preview()).toContain('Intercorrências: Nenhuma');
    expect(
      screen.queryByRole('textbox', { name: 'Descreva a intercorrência' }),
    ).not.toBeInTheDocument();
  });

  it('guarda o rascunho na aba e recusa rascunho fora do formato', () => {
    expect(parseEvolutionDraft(EMPTY_EVOLUTION_DRAFT)).toEqual(EMPTY_EVOLUTION_DRAFT);
    expect(parseEvolutionDraft({ ...EMPTY_EVOLUTION_DRAFT, side: 'X' })).toBeNull();
    expect(parseEvolutionDraft({ ...EMPTY_EVOLUTION_DRAFT, motorBlock: 'sim' })).toBeNull();
    expect(
      parseEvolutionDraft({ ...EMPTY_EVOLUTION_DRAFT, indication: 'x'.repeat(201) }),
    ).toBeNull();
    expect(parseEvolutionDraft('texto')).toBeNull();

    expect(draftToForm({ ...EMPTY_EVOLUTION_DRAFT, volume: '20,5', dose: '1.500' })).toMatchObject({
      volumeMl: 20.5,
      doseMg: null,
    });
  });
});

describe('peso adulto compartilhado', () => {
  it('lê só o formato { savedAt, value } dentro da validade', () => {
    const now = 1_000_000_000;
    writeToolSession('peso-adulto', '72,5', now);
    const asText = (value: unknown) => (typeof value === 'string' ? value : null);
    expect(readToolSession('peso-adulto', asText, now + 1000)).toBe('72,5');
    expect(readToolSession('peso-adulto', asText, now + TOOL_SESSION_TTL_MS + 1)).toBeNull();
    expect(readToolSession('peso-adulto', asText, now - 1)).toBeNull();

    window.sessionStorage.setItem(WEIGHT_KEY, '{quebrado');
    expect(readToolSession('peso-adulto', asText)).toBeNull();
    window.sessionStorage.setItem(WEIGHT_KEY, JSON.stringify({ value: '70' }));
    expect(readToolSession('peso-adulto', asText)).toBeNull();
  });
});

describe('trilha dos bloqueios', () => {
  afterEach(() => {
    navigation.pathname = '/ferramentas/bloqueios';
  });

  it('Ferramentas › Bloqueios regionais › seção ou ficha', () => {
    navigation.pathname = '/ferramentas/bloqueios/dose-maxima';
    const { unmount } = render(<RouteBreadcrumbs />);
    expect(screen.getByRole('link', { name: 'Bloqueios regionais' })).toHaveAttribute(
      'href',
      '/ferramentas/bloqueios',
    );
    expect(screen.getByText('Dose máxima')).toBeVisible();
    unmount();

    navigation.pathname = '/ferramentas/bloqueios/fascia-iliaca';
    render(<RouteBreadcrumbs />);
    expect(screen.getByText('Bloqueio de fáscia ilíaca')).toBeVisible();
  });
});
