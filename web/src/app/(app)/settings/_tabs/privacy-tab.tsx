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
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, Download, Trash, Warning, ShieldCheck } from '@phosphor-icons/react';
import { SettingsPane, SettingsRow, SettingsSection } from '../_components/settings-layout';

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
  erased: {
    encounters: number;
    encounterAttachments: number;
    audioCaptures: number;
    consents: number;
    refreshTokens: number;
    storageObjects: number;
  };
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
    <SettingsPane
      title="Privacidade e LGPD"
      description="Seus direitos como titular de dados (Lei nº 13.709/2018, Art. 18)."
    >
      <SettingsSection title="Seus dados">
        <SettingsRow
          title="Exportar meus dados"
          description="Baixe todos os seus dados em formato JSON (Art. 18, V — Portabilidade). Inclui atendimentos, referências anexadas, transcrições de áudio, documentos, interações IA, consentimentos e auditoria."
          control={
            <Button
              variant="outline"
              size="sm"
              className="max-sm:h-10"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download />
              {exporting ? 'Gerando...' : 'Baixar'}
            </Button>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Consentimentos"
        description="Você pode revogar ou conceder cada um a qualquer momento."
      >
        {isLoading ? (
          <div className="flex flex-col divide-y divide-border" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2 py-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            ))}
          </div>
        ) : consents && consents.length > 0 ? (
          consents.map((consent) => {
            const config = SCOPE_LABELS[consent.scope] ?? {
              label: consent.scope,
              description: '',
            };
            return (
              <SettingsRow
                key={consent.scope}
                title={
                  <>
                    {config.label}
                    {consent.granted ? (
                      <Badge variant="success">
                        <ShieldCheck weight="fill" aria-hidden="true" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Revogado</Badge>
                    )}
                  </>
                }
                description={config.description || undefined}
                control={
                  consent.granted ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="max-sm:h-10"
                      onClick={() => revokeConsent.mutate(consent.scope)}
                      disabled={revokeConsent.isPending}
                    >
                      Revogar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="max-sm:h-10"
                      onClick={() => grantConsent.mutate(consent.scope)}
                      disabled={grantConsent.isPending}
                    >
                      Conceder
                    </Button>
                  )
                }
              >
                {consent.grantedAt && (
                  <p className="text-xs text-muted-foreground">
                    Concedido em{' '}
                    {new Date(consent.grantedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </SettingsRow>
            );
          })
        ) : (
          <p className="py-4 text-sm text-muted-foreground">Nenhum consentimento registrado.</p>
        )}
      </SettingsSection>

      <SettingsSection title="Zona de perigo">
        <SettingsRow
          title="Excluir conta e dados"
          description="Direito ao esquecimento (Art. 18, VI). Todos os seus atendimentos, documentos e dados serão permanentemente removidos. Esta ação é irreversível."
          control={
            <Dialog open={erasureDialog} onOpenChange={setErasureDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="max-sm:h-10">
                  <Trash />
                  Excluir conta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle variant="brand">Confirmar exclusão irreversível</DialogTitle>
                  <DialogDescription>
                    Você está prestes a excluir permanentemente todos os seus dados. Esta ação não
                    pode ser desfeita.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <Callout tone="red" icon={<Warning weight="fill" />} title="O que será removido:">
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.8125rem]">
                      <li>Todos os atendimentos e documentos</li>
                      <li>Histórico de interações com IA</li>
                      <li>Consentimentos e tokens de sessão</li>
                      <li>Dados pessoais (nome, e-mail, CRM)</li>
                    </ul>
                  </Callout>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="erasure-confirm" className="text-sm text-muted-foreground">
                      Para confirmar, digite{' '}
                      <strong className="font-semibold text-foreground">EXCLUIR</strong> abaixo:
                    </label>
                    <Input
                      id="erasure-confirm"
                      type="text"
                      value={erasureConfirm}
                      onChange={(e) => setErasureConfirm(e.target.value)}
                      placeholder="EXCLUIR"
                      autoComplete="off"
                    />
                  </div>
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
                    <Lock />
                    Excluir permanentemente
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />
      </SettingsSection>
    </SettingsPane>
  );
}
