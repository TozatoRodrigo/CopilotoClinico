'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock, Key, Monitor, Trash, ArrowsClockwise, Warning, Download, Copy, Check } from '@phosphor-icons/react';

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
  /** User-Agent bruto do dispositivo (nem sempre presente — depende do backend). */
  userAgent?: string;
  /** IP de origem (opcional — pode ser mascarado por privacidade). */
  ip?: string;
  /** Última atividade registrada (opcional). */
  lastUsedAt?: string;
}

/**
 * Parse simples de User-Agent para exibir dispositivo/SO amigável.
 * Não tenta ser completo — cobre iOS Safari, Chrome Android, Mac/Windows.
 */
function describeDevice(ua?: string): string {
  if (!ua) return 'Dispositivo desconhecido';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone / iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/mac os x|macintosh/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Outro dispositivo';
}

function describeBrowser(ua?: string): string {
  if (!ua) return '';
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return '';
}

export function SecurityTab() {
  const queryClient = useQueryClient();
  const { physician, updatePhysician } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // S24-MFA-03 — diálogos para gestão MFA.
  const [disableMfaOpen, setDisableMfaOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [totpInput, setTotpInput] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);

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

  // S24-MFA-03 — Desabilitar MFA (exige TOTP).
  const disableMfaMutation = useMutation({
    mutationFn: (totp: string) =>
      apiClient.delete('/auth/mfa', { totpCode: totp }),
    onSuccess: () => {
      updatePhysician({ mfaEnabled: false });
      toast.success('MFA desativada. Considere reativar para proteger sua conta.');
      setDisableMfaOpen(false);
      setTotpInput('');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Código TOTP inválido.');
    },
  });

  // S24-MFA-03 — Regenerar códigos de backup (exige TOTP).
  const regenerateBackupsMutation = useMutation({
    mutationFn: (totp: string) =>
      apiClient.post<{ backupCodes: string[] }>('/auth/mfa/regenerate-backup-codes', {
        totpCode: totp,
      }),
    onSuccess: (data) => {
      setNewBackupCodes(data.backupCodes);
      toast.success('Novos códigos gerados. Os anteriores foram invalidados.');
      setTotpInput('');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Código TOTP inválido.');
    },
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

  // S24-MFA-02 — download dos códigos regenerados.
  function handleDownloadCodes() {
    if (!newBackupCodes) return;
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      'Copiloto Clínico — NOVOS códigos de recuperação MFA',
      `Gerados em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'Códigos ANTERIORES foram invalidados.',
      '',
      ...newBackupCodes.map((c, i) => `${i + 1}. ${c}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copiloto-codigos-recuperacao-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
        <h2 className="text-sm font-semibold text-clinical-ink">Segurança da conta</h2>
        <p className="mt-1 text-xs text-muted-foreground">Gerencie MFA, senha e sessões ativas.</p>
      </div>

      {/* S24-MFA-03 — seção MFA autônoma. Antes era só informativo ("ativo").
          Agora médico pode desabilitar/regenerar/reconfigurar sem falar com admin. */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="size-4" />
          Autenticação de dois fatores (MFA)
        </h3>
        <div className="space-y-3 rounded-lg border border-clinical-line bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck
              className={physician?.mfaEnabled ? 'size-5 shrink-0 text-clinical-green' : 'size-5 shrink-0 text-muted-foreground'}
              weight="fill"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-clinical-ink">
                {physician?.mfaEnabled ? 'MFA TOTP ativo' : 'MFA desativado'}
              </p>
              <p className="text-xs text-muted-foreground">
                {physician?.mfaEnabled
                  ? 'Use seu app autenticador (Authy, Google Authenticator, 1Password) para gerar códigos de login.'
                  : 'Sua conta está menos protegida. Considere ativar MFA.'}
              </p>
            </div>
            {physician?.mfaEnabled ? (
              <Badge variant="success">Ativa</Badge>
            ) : (
              <Badge variant="destructive">Inativa</Badge>
            )}
          </div>

          {physician?.mfaEnabled && (
            <div className="flex flex-wrap gap-2 border-t border-clinical-line/50 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => {
                  setNewBackupCodes(null);
                  setRegenerateOpen(true);
                }}
              >
                <ArrowsClockwise className="size-3.5" />
                Regenerar códigos de backup
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
                onClick={() => setDisableMfaOpen(true)}
              >
                <Warning className="size-3.5" />
                Desativar MFA
              </Button>
            </div>
          )}
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

      {/*
        S24-SET-01 — sessões ricas. Antes só mostrava "Sessão ativa" + createdAt.
        Agora descreve dispositivo (parse UA), navegador, último acesso e IP
        quando disponível. Confirmação antes de revoke (antes era direto).
      */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Monitor className="size-4" />
          Sessões ativas
        </h3>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg border border-clinical-line bg-white" />
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.map((session) => {
              const device = describeDevice(session.userAgent);
              const browser = describeBrowser(session.userAgent);
              const isCurrent = session.id === sessions[0]?.id; // heuristic
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3"
                >
                  <Monitor className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-clinical-ink">{device}</p>
                      {browser && (
                        <span className="text-xs text-muted-foreground">· {browser}</span>
                      )}
                      {isCurrent && (
                        <Badge variant="success" className="text-[10px]">atual</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Iniciada em{' '}
                      {new Date(session.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {session.ip && ` · IP ${session.ip}`}
                    </p>
                    {session.lastUsedAt && (
                      <p className="text-xs text-muted-foreground">
                        Última atividade:{' '}
                        {new Date(session.lastUsedAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Encerrar esta sessão? O dispositivo será desconectado.')) {
                        revokeSession.mutate(session.id);
                      }
                    }}
                    disabled={revokeSession.isPending}
                    aria-label={`Encerrar sessão ${device}`}
                  >
                    <Trash className="mr-1 size-3.5" />
                    Encerrar
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-clinical-line bg-white px-4 py-3 text-center text-sm text-muted-foreground">
            Nenhuma sessão ativa encontrada.
          </div>
        )}
      </section>

      {/* S24-MFA-03 — dialog: desativar MFA (exige TOTP) */}
      <Dialog open={disableMfaOpen} onOpenChange={setDisableMfaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle variant="brand">Desativar autenticação de dois fatores</DialogTitle>
            <DialogDescription>
              Esta ação reduz a segurança da sua conta. Digite um código TOTP atual
              do seu app autenticador para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-destructive">Atenção:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Sua conta fica vulnerável a ataques de senha</li>
                <li>Todos os códigos de backup serão invalidados</li>
                <li>Operações sensíveis continuarão exigindo senha</li>
              </ul>
            </div>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={totpInput}
              onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg font-mono tracking-[0.5em]"
              aria-label="Código TOTP de 6 dígitos"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableMfaOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={totpInput.length !== 6 || disableMfaMutation.isPending}
              onClick={() => disableMfaMutation.mutate(totpInput)}
            >
              {disableMfaMutation.isPending ? 'Desativando...' : 'Confirmar desativação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* S24-MFA-03 — dialog: regenerar códigos de backup */}
      <Dialog open={regenerateOpen} onOpenChange={(o) => { setRegenerateOpen(o); if (!o) setNewBackupCodes(null); }}>
        <DialogContent>
          {!newBackupCodes ? (
            <>
              <DialogHeader>
                <DialogTitle variant="brand">Regenerar códigos de backup</DialogTitle>
                <DialogDescription>
                  Códigos anteriores serão <strong>invalidados imediatamente</strong>.
                  Confirme com um código TOTP atual.
                </DialogDescription>
              </DialogHeader>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={totpInput}
                onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-lg font-mono tracking-[0.5em]"
                aria-label="Código TOTP de 6 dígitos"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegenerateOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={totpInput.length !== 6 || regenerateBackupsMutation.isPending}
                  onClick={() => regenerateBackupsMutation.mutate(totpInput)}
                >
                  {regenerateBackupsMutation.isPending ? 'Gerando...' : 'Gerar novos códigos'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle variant="brand">Novos códigos de backup</DialogTitle>
                <DialogDescription>
                  Guarde estes códigos em local seguro. Eles não serão exibidos novamente.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-clinical-line bg-clinical-paper p-3">
                {newBackupCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="rounded bg-white px-2 py-1.5 text-center font-mono text-sm tabular-nums"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(newBackupCodes.join('\n'));
                    setCodesCopied(true);
                    setTimeout(() => setCodesCopied(false), 2000);
                  }}
                >
                  {codesCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {codesCopied ? 'Copiado!' : 'Copiar'}
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={handleDownloadCodes}>
                  <Download className="size-3.5" />
                  Baixar
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setRegenerateOpen(false)}>Já salvei os códigos</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
