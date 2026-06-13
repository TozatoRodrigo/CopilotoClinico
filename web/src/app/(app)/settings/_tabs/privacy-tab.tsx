'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Lock, Download, Trash, Warning, ShieldCheck } from '@phosphor-icons/react';

interface ConsentScopeStatus {
  scope: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
}

interface ExportData {
  exportVersion: string;
  generatedAt: string;
  dataSubject: { type: string; id: string };
  data: Record<string, unknown>;
}

interface ErasureResponse {
  status: string;
  estimatedCompletion: string;
  erased: { encounters: number; consents: number; refreshTokens: number };
}

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  ai_processing: {
    label: 'Processamento por IA',
    description: 'Permite que a IA analise dados clínicos para gerar recomendações e documentos.',
  },
  data_sharing: {
    label: 'Compartilhamento de dados',
    description: 'Compartilha dados com a instituição de saúde vinculada (quando aplicável).',
  },
  analytics: {
    label: 'Analytics',
    description: 'Coleta métricas de uso anônimas para melhorar o produto.',
  },
};

export function PrivacyTab() {
  const queryClient = useQueryClient();
  const [erasureDialog, setErasureDialog] = useState(false);
  const [erasureConfirm, setErasureConfirm] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: consents, isLoading } = useQuery({
    queryKey: ['lgpd', 'consents'],
    queryFn: () => apiClient.get<ConsentScopeStatus[]>('/lgpd/consent'),
  });

  const revokeConsent = useMutation({
    mutationFn: (scope: string) => apiClient.delete(`/lgpd/consent/${scope}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lgpd', 'consents'] });
      toast.success('Consentimento revogado.');
    },
    onError: () => toast.error('Erro ao revogar consentimento.'),
  });

  const grantConsent = useMutation({
    mutationFn: (scope: string) => apiClient.post('/lgpd/consent', { scope }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lgpd', 'consents'] });
      toast.success('Consentimento concedido.');
    },
    onError: () => toast.error('Erro ao conceder consentimento.'),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const data = await apiClient.get<ExportData>('/lgpd/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Dados exportados com sucesso.');
    } catch {
      toast.error('Erro ao exportar dados.');
    } finally {
      setExporting(false);
    }
  }

  async function handleErasure() {
    try {
      const result = await apiClient.post<ErasureResponse>('/lgpd/erasure', {});
      toast.success(
        `Conta excluída. ${result.erased.encounters} atendimentos, ${result.erased.consents} consentimentos removidos.`,
      );
      setErasureDialog(false);
      window.location.href = '/login';
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao excluir conta.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
        <h2 className="text-sm font-semibold text-clinical-ink">Privacidade e LGPD</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Seus direitos como titular de dados (Lei nº 13.709/2018, Art. 18).
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-clinical-line bg-white px-4 py-4">
          <Download className="mt-0.5 size-5 shrink-0 text-clinical-teal" />
          <div className="flex-1">
            <p className="text-sm font-medium text-clinical-ink">Exportar meus dados</p>
            <p className="text-xs text-muted-foreground">
              Baixe todos os seus dados em formato JSON (Art. 18, V — Portabilidade). Inclui
              atendimentos, documentos, interações IA, consentimentos e auditoria.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Gerando...' : 'Baixar'}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Consentimentos
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-clinical-line bg-white"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {consents?.map((consent) => {
              const config = SCOPE_LABELS[consent.scope] ?? {
                label: consent.scope,
                description: '',
              };
              return (
                <div
                  key={consent.scope}
                  className="flex items-start gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3"
                >
                  <ShieldCheck
                    className={`mt-0.5 size-5 shrink-0 ${
                      consent.granted ? 'text-clinical-green' : 'text-muted-foreground'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-clinical-ink">{config.label}</p>
                      {consent.granted ? (
                        <span className="rounded-full bg-clinical-green-bg px-2 py-0.5 text-xs font-medium text-clinical-green-foreground">
                          Ativo
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Revogado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{config.description}</p>
                    {consent.grantedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Concedido em{' '}
                        {new Date(consent.grantedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  {consent.granted ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeConsent.mutate(consent.scope)}
                      disabled={revokeConsent.isPending}
                    >
                      Revogar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => grantConsent.mutate(consent.scope)}
                      disabled={grantConsent.isPending}
                    >
                      Conceder
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4">
          <div className="flex items-start gap-3">
            <Warning className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Excluir conta e dados</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Direito ao esquecimento (Art. 18, VI). Todos os seus atendimentos, documentos e
                dados serão permanentemente removidos. Esta ação é irreversível.
              </p>
            </div>
          </div>
          <Dialog open={erasureDialog} onOpenChange={setErasureDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="mt-3">
                <Trash className="mr-1 size-4" />
                Excluir conta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmar exclusão irreversível</DialogTitle>
                <DialogDescription>
                  Você está prestes a excluir permanentemente todos os seus dados. Esta ação não
                  pode ser desfeita.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-destructive">O que será removido:</p>
                  <ul className="mt-2 space-y-1">
                    <li>• Todos os atendimentos e documentos</li>
                    <li>• Histórico de interações com IA</li>
                    <li>• Consentimentos e tokens de sessão</li>
                    <li>• Dados pessoais (nome, e-mail, CRM)</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  Para confirmar, digite <strong className="text-clinical-ink">EXCLUIR</strong>{' '}
                  abaixo:
                </p>
                <input
                  type="text"
                  value={erasureConfirm}
                  onChange={(e) => setErasureConfirm(e.target.value)}
                  className="w-full rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm"
                  placeholder="EXCLUIR"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setErasureDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleErasure}
                  disabled={erasureConfirm !== 'EXCLUIR'}
                >
                  <Lock className="mr-1 size-4" />
                  Excluir permanentemente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
