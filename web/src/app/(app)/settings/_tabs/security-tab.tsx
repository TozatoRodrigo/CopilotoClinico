'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Lock, Key, Monitor, Trash } from '@phosphor-icons/react';

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export function SecurityTab() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiClient.get<Session[]>('/auth/me/sessions'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/auth/me/password', {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      toast.success('Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
      } else {
        setPasswordError('Erro ao alterar senha.');
      }
    },
  });

  const revokeSession = useMutation({
    mutationFn: (tokenId: string) => apiClient.delete(`/auth/me/sessions/${tokenId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      toast.success('Sessão encerrada.');
    },
    onError: () => toast.error('Erro ao encerrar sessão.'),
  });

  function validatePassword(): boolean {
    if (!currentPassword) {
      setPasswordError('Senha atual é obrigatória.');
      return false;
    }
    if (newPassword.length < 8) {
      setPasswordError('Nova senha deve ter no mínimo 8 caracteres.');
      return false;
    }
    if (
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/\d/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setPasswordError('Senha deve conter maiúscula, minúscula, número e caractere especial.');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.');
      return false;
    }
    setPasswordError('');
    return true;
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validatePassword()) return;
    changePasswordMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
        <h2 className="text-sm font-semibold text-clinical-ink">Segurança da conta</h2>
        <p className="mt-1 text-xs text-muted-foreground">Gerencie MFA, senha e sessões ativas.</p>
      </div>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="size-4" />
          Autenticação de dois fatores
        </h3>
        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          <ShieldCheck className="size-5 shrink-0 text-clinical-green" />
          <div className="flex-1">
            <p className="text-sm font-medium text-clinical-ink">MFA TOTP ativo</p>
            <p className="text-xs text-muted-foreground">
              Configurado no onboarding. Use seu app autenticador para gerar códigos.
            </p>
          </div>
          <span className="rounded-full bg-clinical-green-bg px-2 py-0.5 text-xs font-medium text-clinical-green-foreground">
            Ativa
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Key className="size-4" />
          Alterar senha
        </h3>
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={changePasswordMutation.isPending}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changePasswordMutation.isPending}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={changePasswordMutation.isPending}
              autoComplete="new-password"
            />
          </div>
          {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
          <Button type="submit" disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Monitor className="size-4" />
          Sessões ativas
        </h3>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg border border-clinical-line bg-white" />
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3"
              >
                <Monitor className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-clinical-ink">Sessão ativa</p>
                  <p className="text-xs text-muted-foreground">
                    Iniciada em{' '}
                    {new Date(session.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeSession.mutate(session.id)}
                  disabled={revokeSession.isPending}
                >
                  <Trash className="mr-1 size-3.5" />
                  Encerrar
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-clinical-line bg-white px-4 py-3 text-center text-sm text-muted-foreground">
            Nenhuma sessão ativa encontrada.
          </div>
        )}
      </section>
    </div>
  );
}
