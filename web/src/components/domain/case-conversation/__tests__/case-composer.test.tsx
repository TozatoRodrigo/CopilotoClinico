import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseComposer } from '../case-composer';
import { contextFromSite, EMPTY_CONTEXT } from '@/lib/practice-sites';
import type { PracticeSite } from '@/lib/types';

const sitesState: { data: PracticeSite[] | undefined; isPending: boolean } = {
  data: [],
  isPending: false,
};

vi.mock('@/hooks/use-practice-sites', () => ({
  usePracticeSites: () => sitesState,
}));

vi.mock('@/hooks/use-whisper-voice', () => ({
  useWhisperVoice: () => ({
    status: 'idle',
    isListening: false,
    isUploading: false,
    elapsedMs: 0,
    audioLevel: null,
    error: null,
    isSupported: false,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('@/components/providers/offline-provider', () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

vi.mock('@/components/domain/encounter-attachments', () => ({
  EncounterAttachments: () => null,
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
  specialists: [],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 70,
  isDefault: true,
  createdAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};

const CASE_TEXT = 'Masc, 66a, hemiparesia E súbita há 1h, PA 172x98.';

function renderComposer(initialContext = contextFromSite(upa)) {
  const onSubmit = vi.fn().mockResolvedValue('started');
  render(
    <CaseComposer
      encounterId="enc-1"
      demoPreset={null}
      initialContext={initialContext}
      sending={false}
      error={null}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

function resource(name: string) {
  const group = screen.getByRole('group', { name: 'Recursos' });
  return within(group).getByRole('button', { name });
}

/**
 * CC-602 — o relato começa com o contexto com que o caso nasceu (o local
 * padrão das Configurações). Antes ele começava sempre com tudo desmarcado
 * e apagava o que fora marcado na criação do caso.
 */
describe('CaseComposer — local de plantão', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sitesState.data = [upa];
    sitesState.isPending = false;
  });

  it('starts from the case context: the default site and its resources', () => {
    renderComposer();

    expect(resource('TC')).toHaveAttribute('aria-pressed', 'false');
    expect(resource('Labs')).toHaveAttribute('aria-pressed', 'true');
    expect(resource('UTI')).toHaveAttribute('aria-pressed', 'false');
    expect(resource('SUS')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Local do plantão' })).toHaveTextContent(
      'UPA Centro (padrão)',
    );
    expect(
      screen.getByText('UPA 24h porte I · sem TC e UTI · referência a 90 min'),
    ).toBeInTheDocument();
  });

  it('sends the site with the case', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();

    await user.type(screen.getByRole('textbox', { name: 'Descrição do caso clínico' }), CASE_TEXT);
    await user.click(screen.getByRole('button', { name: /Enviar caso/ }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ caseText: CASE_TEXT, context: contextFromSite(upa) }),
      ),
    );
  });

  it('lets the physician change a resource on the case and keeps the site', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();

    // O tomógrafo da UPA voltou a funcionar hoje.
    await user.click(resource('TC'));
    expect(screen.getByText('UPA 24h porte I · sem UTI · referência a 90 min')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Descrição do caso clínico' }), CASE_TEXT);
    await user.click(screen.getByRole('button', { name: /Enviar caso/ }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { ...contextFromSite(upa), hasCT: true },
        }),
      ),
    );
  });

  it('points to the settings when the physician has no site yet', () => {
    sitesState.data = [];
    renderComposer(EMPTY_CONTEXT);

    expect(screen.getByRole('link', { name: /Locais de plantão/ })).toHaveAttribute(
      'href',
      '/settings?tab=locais',
    );
    expect(resource('TC')).toHaveAttribute('aria-pressed', 'false');
  });
});
