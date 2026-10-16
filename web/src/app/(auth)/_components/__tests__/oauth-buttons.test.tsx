import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OAuthButtons } from '../oauth-buttons';

const apiGetMock = vi.fn();

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    API_BASE_URL: 'https://copiloto.example/v1',
    apiClient: { get: (...args: unknown[]) => apiGetMock(...args) },
  };
});

function renderButtons(verb: 'Entrar' | 'Cadastrar' = 'Entrar') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OAuthButtons verb={verb} />
    </QueryClientProvider>,
  );
}

describe('OAuthButtons (CC-334)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('shows one button per configured provider, pointing to the API start route', async () => {
    apiGetMock.mockResolvedValue({ providers: ['google', 'microsoft'] });

    renderButtons();

    const google = await screen.findByRole('link', { name: 'Entrar com Google' });
    expect(google).toHaveAttribute('href', 'https://copiloto.example/v1/auth/oauth/google/start');
    expect(screen.getByRole('link', { name: 'Entrar com Microsoft' })).toHaveAttribute(
      'href',
      'https://copiloto.example/v1/auth/oauth/microsoft/start',
    );
    expect(apiGetMock).toHaveBeenCalledWith('/auth/oauth/providers');
  });

  it('only shows the providers the API reports', async () => {
    apiGetMock.mockResolvedValue({ providers: ['microsoft'] });

    renderButtons('Cadastrar');

    expect(
      await screen.findByRole('link', { name: 'Cadastrar com Microsoft' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Google/ })).not.toBeInTheDocument();
  });

  it('renders nothing when no provider is configured', async () => {
    apiGetMock.mockResolvedValue({ providers: [] });

    const { container } = renderButtons();

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the API call fails', async () => {
    apiGetMock.mockRejectedValue(new Error('offline'));

    const { container } = renderButtons();

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
