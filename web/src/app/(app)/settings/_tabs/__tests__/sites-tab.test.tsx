import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SitesTab } from '../sites-tab';
import type { PracticeSite } from '@/lib/types';

const saveMock = vi.fn();
const deleteMock = vi.fn();
const sitesState: {
  data: PracticeSite[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} = { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() };

vi.mock('@/hooks/use-practice-sites', () => ({
  usePracticeSites: () => sitesState,
  useSavePracticeSite: () => ({ mutateAsync: saveMock, isPending: false }),
  useDeletePracticeSite: () => ({ mutateAsync: deleteMock, isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const upa: PracticeSite = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  hasCT: false,
  hasLab: true,
  hasICU: false,
  isSus: true,
  specialists: ['pediatria'],
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
  isDefault: false,
};

/** CC-602 — Configurações → Locais de plantão. */
describe('SitesTab', () => {
  beforeEach(() => {
    saveMock.mockReset().mockResolvedValue(upa);
    deleteMock.mockReset().mockResolvedValue(undefined);
    sitesState.data = [upa, norte];
    sitesState.isPending = false;
  });

  it('lists the sites with what each one lacks and marks the default', () => {
    render(<SitesTab />);

    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    expect(screen.getByText('Padrão')).toBeInTheDocument();
    expect(
      screen.getAllByText('UPA 24h porte I · sem TC e UTI · referência a 90 min'),
    ).toHaveLength(2);
    expect(screen.getAllByText('Pediatria')).toHaveLength(2);
  });

  it('moves the default with the whole site, as the API expects', async () => {
    const user = userEvent.setup();
    render(<SitesTab />);

    await user.click(screen.getByRole('button', { name: 'Tornar padrão' }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        id: norte.id,
        input: {
          name: 'UPA Norte',
          facilityType: 'upa_porte_1',
          hasCT: false,
          hasLab: true,
          hasICU: false,
          isSus: true,
          specialists: ['pediatria'],
          referenceTravelMinutes: 90,
          referenceDistanceKm: 70,
          isDefault: true,
        },
      }),
    );
  });

  it('creates the first site as the default, without any patient data field', async () => {
    const user = userEvent.setup();
    sitesState.data = [];
    render(<SitesTab />);

    expect(screen.getByText('Nenhum local salvo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Adicionar local/ }));
    await user.type(screen.getByLabelText('Nome do local'), 'UPA do Interior');
    await user.click(screen.getByRole('button', { name: 'Neurologia' }));
    await user.type(screen.getByLabelText('Tempo até a referência (min)'), '120');
    await user.click(screen.getByRole('button', { name: 'Salvar local' }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        id: undefined,
        input: {
          name: 'UPA do Interior',
          facilityType: 'upa_porte_1',
          hasCT: false,
          hasLab: true,
          hasICU: false,
          isSus: true,
          specialists: ['neurologia'],
          referenceTravelMinutes: 120,
          referenceDistanceKm: null,
          isDefault: true,
        },
      }),
    );
  });

  it('shows the validation error before calling the API', async () => {
    const user = userEvent.setup();
    render(<SitesTab />);

    await user.click(screen.getByRole('button', { name: /Adicionar local/ }));
    await user.type(screen.getByLabelText('Nome do local'), 'UPA');
    await user.type(screen.getByLabelText('Tempo até a referência (min)'), 'uma hora');
    await user.click(screen.getByRole('button', { name: 'Salvar local' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/minutos inteiros/);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('asks before deleting a site', async () => {
    const user = userEvent.setup();
    render(<SitesTab />);

    await user.click(screen.getByRole('button', { name: 'Excluir UPA Norte' }));
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Excluir local' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(norte.id));
  });
});
