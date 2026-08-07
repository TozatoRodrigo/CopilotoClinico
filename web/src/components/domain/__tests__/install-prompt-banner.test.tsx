import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallPromptBanner, markFirstAnalysisDone } from '../install-prompt-banner';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

function mockMatchMedia(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('display-mode: standalone') ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Ambiente "elegível" por padrão: mobile, não-standalone. Sobrescrito por teste quando necessário. */
function setupEligibleEnvironment(ua: string) {
  setUserAgent(ua);
  setViewportWidth(375);
  mockMatchMedia(false);
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true });
}

function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('InstallPromptBanner (UX-05)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setupEligibleEnvironment(IOS_UA);
  });

  it('does not render before the first successful analysis', () => {
    render(<InstallPromptBanner />);
    expect(screen.queryByRole('region', { name: /instalar/i })).not.toBeInTheDocument();
  });

  it('renders iOS share instructions after the first analysis, on a mobile non-standalone iPhone', async () => {
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /instalar/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Adicionar à tela inicial/)).toBeInTheDocument();
    expect(screen.getByText(/Compartilhar/)).toBeInTheDocument();
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    // iOS não tem botão "Instalar" — não existe API para isso no Safari.
    expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument();
  });

  it('detects iPadOS (reports as Macintosh with touch support)', async () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Compartilhar/)).toBeInTheDocument();
    });
  });

  it('renders the Android install button only after beforeinstallprompt fires, and triggers the native prompt on tap', async () => {
    setupEligibleEnvironment(ANDROID_UA);
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    // Sem beforeinstallprompt ainda, o banner não aparece no Android.
    expect(screen.queryByRole('region', { name: /instalar/i })).not.toBeInTheDocument();

    const event = fireBeforeInstallPrompt();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Instalar/ })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Instalar/ }));

    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('does not render on desktop viewport even after the first analysis', async () => {
    setupEligibleEnvironment(ANDROID_UA);
    setViewportWidth(1280);
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);
    fireBeforeInstallPrompt();

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: /instalar/i })).not.toBeInTheDocument();
  });

  it('does not render when already running in standalone display mode', async () => {
    mockMatchMedia(true);
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: /instalar/i })).not.toBeInTheDocument();
  });

  it('hides on dismiss and records the dismissal so it does not reappear this session', async () => {
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    const banner = await screen.findByRole('region', { name: /instalar/i });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dispensar' }));

    expect(banner).not.toBeInTheDocument();
    expect(sessionStorage.getItem('pwa_install_dismissed_this_session')).toBe('1');
    expect(localStorage.getItem('pwa_install_dismiss_count')).toBe('1');
  });

  it('never shows again after being dismissed twice in total, even in a fresh session', async () => {
    localStorage.setItem('pwa_install_dismiss_count', '2');
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: /instalar/i })).not.toBeInTheDocument();
  });

  it('does not render on desktop browsers (platform "other")', async () => {
    setupEligibleEnvironment(DESKTOP_UA);
    markFirstAnalysisDone();
    render(<InstallPromptBanner />);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: /instalar/i })).not.toBeInTheDocument();
  });
});
