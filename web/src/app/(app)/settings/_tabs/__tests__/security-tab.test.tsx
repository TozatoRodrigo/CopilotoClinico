import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SecurityTab } from '../security-tab';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiPatchMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      post: (...args: unknown[]) => apiPostMock(...args),
      patch: (...args: unknown[]) => apiPatchMock(...args),
      delete: vi.fn(),
    },
  };
});

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({
    physician: { id: 'p1', email: 'dra@example.com', mfaEnabled: false },
    updatePhysician: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  },
}));

const { ApiError } = await import('@/lib/api-client');

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SecurityTab />
    </QueryClientProvider>,
  );
}

async function submitPasswordForm(current: string, next: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Senha atual'), current);
  await user.type(screen.getByLabelText('Nova senha'), next);
  await user.type(screen.getByLabelText('Confirmar nova senha'), next);
  await user.click(screen.getByRole('button', { name: 'Alterar senha' }));
}

// CC-014 — a tela chamava POST /auth/me/password e a API só expõe PATCH: a
// troca de senha dava 404. O verbo do lado da API está preso em
// src/modules/auth/auth.controller.spec.ts.
describe('SecurityTab — alterar senha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockResolvedValue([]);
  });

  it('changes the password with PATCH /auth/me/password', async () => {
    apiPatchMock.mockResolvedValue(undefined);
    renderTab();

    await submitPasswordForm('Atual@123', 'NovaSenha@1');

    await waitFor(() =>
      expect(apiPatchMock).toHaveBeenCalledWith('/auth/me/password', {
        currentPassword: 'Atual@123',
        newPassword: 'NovaSenha@1',
      }),
    );
    expect(apiPostMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('Senha alterada com sucesso.'),
    );
  });

  it('shows the API message when the current password is wrong', async () => {
    apiPatchMock.mockRejectedValue(new ApiError(400, 'Senha atual incorreta'));
    renderTab();

    await submitPasswordForm('Errada@123', 'NovaSenha@1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Senha atual incorreta');
  });
});
