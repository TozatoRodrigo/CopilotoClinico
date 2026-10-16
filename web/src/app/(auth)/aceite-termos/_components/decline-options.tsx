'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Lock, SignOut, Trash, Warning } from '@phosphor-icons/react';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const ERASURE_CONFIRMATION = 'EXCLUIR';

/**
 * CC-905 — quem não concorda com o texto novo continua com os direitos de
 * titular (LGPD, Art. 18): sair, levar os dados e excluir a conta. A API
 * deixa essas rotas fora do gate; a tela de Configurações, não, por isso as
 * ações estão aqui também.
 */
export function DeclineOptions() {
  const router = useRouter();
  const { logout } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [erasureOpen, setErasureOpen] = useState(false);
  const [erasureConfirm, setErasureConfirm] = useState('');
  const [erasing, setErasing] = useState(false);

  async function handleLogout() {
    await apiClient.post('/auth/logout').catch(() => undefined);
    logout();
    router.push('/login');
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await apiClient.get<unknown>('/lgpd/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Dados exportados.');
    } catch {
      toast.error('Não foi possível exportar seus dados. Tente de novo.');
    } finally {
      setExporting(false);
    }
  }

  async function handleErasure() {
    setErasing(true);
    try {
      await apiClient.post('/lgpd/erasure', {});
      toast.success('Conta e dados excluídos.');
      setErasureOpen(false);
      logout();
      window.location.href = '/login';
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir a conta.');
    } finally {
      setErasing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">Não concorda?</h2>
        <p className="text-[0.8125rem] text-pretty text-muted-foreground">
          Sem o aceite, o Copiloto fica bloqueado, mas seus direitos de titular continuam: você pode
          levar seus dados ou excluir a conta.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleExport} loading={exporting}>
          <Download aria-hidden="true" />
          Exportar meus dados
        </Button>
        <Dialog
          open={erasureOpen}
          onOpenChange={(open) => {
            setErasureOpen(open);
            if (!open) setErasureConfirm('');
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash aria-hidden="true" />
              Excluir conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle variant="brand">Excluir conta e dados</DialogTitle>
              <DialogDescription>
                Seus atendimentos, documentos e dados pessoais serão apagados. Esta ação não pode
                ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <Callout tone="red" icon={<Warning weight="fill" />} title="O que será removido:">
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.8125rem]">
                  <li>Todos os atendimentos e documentos</li>
                  <li>Histórico de interações com IA</li>
                  <li>Consentimentos, aceites e sessões</li>
                  <li>Nome, e-mail e senha (anonimizados)</li>
                </ul>
              </Callout>
              <div className="flex flex-col gap-2">
                <label htmlFor="decline-erasure-confirm" className="text-sm text-muted-foreground">
                  Para confirmar, digite{' '}
                  <strong className="font-semibold text-foreground">{ERASURE_CONFIRMATION}</strong>{' '}
                  abaixo:
                </label>
                <Input
                  id="decline-erasure-confirm"
                  type="text"
                  value={erasureConfirm}
                  onChange={(event) => setErasureConfirm(event.target.value)}
                  placeholder={ERASURE_CONFIRMATION}
                  autoComplete="off"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setErasureOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleErasure}
                loading={erasing}
                disabled={erasureConfirm !== ERASURE_CONFIRMATION}
              >
                <Lock aria-hidden="true" />
                Excluir permanentemente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <SignOut aria-hidden="true" />
          Sair
        </Button>
      </div>
    </div>
  );
}
