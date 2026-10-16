import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewEncounterPage from '../page';
import { contextFromSite, EMPTY_CONTEXT } from '@/lib/practice-sites';
import type { PracticeSite } from '@/lib/types';

const pushMock = vi.fn();
const apiPostMock = vi.fn();
const sitesState: { data: PracticeSite[] | undefined; isPending: boolean } = {
  data: undefined,
  isPending: true,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiClient: { post: (...args: unknown[]) => apiPostMock(...args) } };
});

vi.mock('@/hooks/use-practice-sites', () => ({
  usePracticeSites: () => sitesState,
}));

const upa: PracticeSite = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  hasCT: false,
  hasLab: true,
  hasICU: false,
  isSus: true,
  specialists: [],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 70,
  isDefault: true,
  createdAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};

const norte: PracticeSite = {
  ...upa,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'UPA Norte',
  facilityType: 'upa_porte_3',
  hasCT: true,
  isDefault: false,
};

/**
 * CC-602 — "dado o perfil do local salvo nas configurações, quando abre um
 * caso, o contexto vem preenchido e pode ser trocado".
 */
describe('Novo caso — contexto pelo local de plantão', () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiPostMock.mockReset().mockResolvedValue({ id: 'enc-1' });
    sitesState.data = [norte, upa];
    sitesState.isPending = false;
  });

  it('prefills the context with the default site', () => {
    render(<NewEncounterPage />);

    expect(screen.getByRole('button', { name: 'TC' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Laboratório' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Local do plantão' })).toHaveTextContent(
      'UPA Centro (padrão)',
    );
  });

  it('creates the case with the default site in the context', async () => {
    const user = userEvent.setup();
    render(<NewEncounterPage />);

    await user.click(screen.getByRole('button', { name: /Iniciar consulta rápida/ }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith('/encounters', {
        patientRef: undefined,
        vertical: 'general',
        context: contextFromSite(upa),
      }),
    );
    expect(pushMock).toHaveBeenCalledWith('/encounters/enc-1/conversation');
  });

  it('follows the site list when it arrives after the page', () => {
    sitesState.data = undefined;
    sitesState.isPending = true;
    const { rerender } = render(<NewEncounterPage />);
    expect(screen.getByRole('button', { name: 'Laboratório' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    sitesState.data = [upa];
    sitesState.isPending = false;
    rerender(<NewEncounterPage />);

    expect(screen.getByRole('button', { name: 'Laboratório' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps what the physician changed and the site it came from', async () => {
    const user = userEvent.setup();
    render(<NewEncounterPage />);

    await user.click(screen.getByRole('button', { name: 'TC' }));
    await user.click(screen.getByRole('button', { name: /Iniciar consulta rápida/ }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/encounters',
        expect.objectContaining({ context: { ...contextFromSite(upa), hasCT: true } }),
      ),
    );
  });

  it('creates the case with nothing marked when the physician has no site', async () => {
    const user = userEvent.setup();
    sitesState.data = [];
    render(<NewEncounterPage />);

    expect(screen.getByRole('link', { name: /Locais de plantão/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Iniciar consulta rápida/ }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/encounters',
        expect.objectContaining({ context: EMPTY_CONTEXT }),
      ),
    );
  });
});
