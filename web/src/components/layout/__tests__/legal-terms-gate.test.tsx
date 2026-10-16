import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLegalTermsGate } from '../legal-terms-gate';

const apiGetMock = vi.fn();
const replaceMock = vi.fn();
let pathname = '/encounters/abc';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => pathname,
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiClient: { get: (...args: unknown[]) => apiGetMock(...args) } };
});

function renderGate(enabled = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(() => useLegalTermsGate(enabled), { wrapper: Wrapper });
}

describe('useLegalTermsGate (CC-905)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = '/encounters/abc';
  });

  it('sends a physician with pending terms to the acceptance screen', async () => {
    apiGetMock.mockResolvedValue({ enabled: true, acceptanceRequired: true, pending: [] });

    renderGate();

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/aceite-termos?from=%2Fencounters%2Fabc'),
    );
    expect(apiGetMock).toHaveBeenCalledWith('/legal/status');
  });

  it('changes nothing with the flag off or the terms accepted', async () => {
    apiGetMock.mockResolvedValueOnce({ enabled: false, acceptanceRequired: false, pending: [] });
    renderGate();
    apiGetMock.mockResolvedValueOnce({ enabled: true, acceptanceRequired: false, pending: [] });
    renderGate();

    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(2));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not ask before the session is known and ignores API failures', async () => {
    renderGate(false);
    apiGetMock.mockRejectedValue(new Error('500'));
    renderGate();

    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
