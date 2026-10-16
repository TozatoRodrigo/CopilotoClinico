import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BetaOnboardingGate } from '../beta-onboarding-gate';

const apiGetMock = vi.fn();
const replaceMock = vi.fn();
let role: 'physician' | 'admin' = 'physician';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ role }),
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiClient: { get: (...args: unknown[]) => apiGetMock(...args) } };
});

function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<BetaOnboardingGate />, { wrapper: Wrapper });
}

describe('BetaOnboardingGate (CC-702)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = 'physician';
  });

  it('sends an invited physician with pending onboarding to the beta onboarding', async () => {
    apiGetMock.mockResolvedValue({ participant: true, needsOnboarding: true });
    renderGate();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/onboarding/beta'));
  });

  it('leaves alone a participant who is done and an account without invite', async () => {
    apiGetMock.mockResolvedValueOnce({ participant: true, needsOnboarding: false });
    renderGate();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith('/beta/me'));

    apiGetMock.mockResolvedValueOnce({ participant: false });
    renderGate();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(2));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not ask for staff accounts and ignores API failures', async () => {
    role = 'admin';
    renderGate();
    role = 'physician';
    apiGetMock.mockRejectedValue(new Error('404'));
    renderGate();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
