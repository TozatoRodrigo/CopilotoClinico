'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  SealCheck,
  SealQuestion,
  SealWarning,
  Clock,
  ArrowClockwise,
  ShieldCheck,
} from '@phosphor-icons/react';

interface VerificationRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  resolvedAt: string | null;
  notes: string | null;
}

const STATUS_CONFIG: Record<
  VerificationRequest['status'],
  { icon: typeof SealCheck; label: string; color: string; bg: string; border: string }
> = {
  PENDING: {
    icon: Clock,
    label: 'Em análise',
    color: 'text-clinical-amber',
    bg: 'bg-clinical-amber-bg',
    border: 'border-clinical-amber/30',
  },
  APPROVED: {
    icon: SealCheck,
    label: 'Aprovado',
    color: 'text-clinical-green',
    bg: 'bg-clinical-green-bg',
    border: 'border-clinical-green/30',
  },
  REJECTED: {
    icon: SealWarning,
    label: 'Rejeitado',
    color: 'text-destructive',
    bg: 'bg-destructive/5',
    border: 'border-destructive/20',
  },
};

export default function CrmVerificationPage() {
  const { physician } = useAuth();
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRequest();
  }, []);

  async function loadRequest() {
    setLoading(true);
    try {
      const data = await apiClient.get<VerificationRequest | null>(
        '/physicians/me/crm-verification',
      );
      setRequest(data);
    } catch {
      toast.error('Erro ao carregar status de verificação.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequest() {
    setSubmitting(true);
    try {
      const data = await apiClient.post<VerificationRequest>('/physicians/me/crm-verification');
      setRequest(data);
      toast.success('Solicitação enviada!');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Erro ao solicitar verificação.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!physician) return null;

  const isVerified = physician.crmVerified;
  const hasRequest = request !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
          Verificação de CRM
        </h1>
        <p className="text-sm text-muted-foreground">
          Status da verificação do seu registro profissional
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-clinical-line bg-clinical-paper p-5">
          <div className="flex size-12 items-center justify-center rounded-full bg-clinical-teal-tint">
            <ShieldCheck className="size-6 text-clinical-teal" />
          </div>
          <div>
            <p className="font-semibold text-clinical-ink">
              CRM {physician.crmUf} {physician.crmNumber}
            </p>
            <p className="text-sm text-muted-foreground">{physician.email}</p>
          </div>
          <div className="ml-auto">
            {isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-clinical-green-bg px-3 py-1 text-xs font-semibold text-clinical-green-foreground">
                <SealCheck className="size-3.5" />
                Verificado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-clinical-amber-bg px-3 py-1 text-xs font-semibold text-clinical-amber-foreground">
                <SealQuestion className="size-3.5" />
                Pendente
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <ArrowClockwise className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && isVerified && (
          <div className="rounded-xl border border-clinical-green/30 bg-clinical-green-bg p-5 text-center">
            <SealCheck className="mx-auto mb-3 size-12 text-clinical-green" weight="duotone" />
            <h2 className="font-display text-lg text-clinical-green-foreground">
              CRM verificado com sucesso
            </h2>
            <p className="mt-1 text-sm text-clinical-green-foreground/80">
              Seus documentos terão selo de verificação completo.
            </p>
          </div>
        )}

        {!loading && !isVerified && hasRequest && request && (
          <div
            className={`rounded-xl border p-5 ${STATUS_CONFIG[request.status].bg} ${STATUS_CONFIG[request.status].border}`}
          >
            {(() => {
              const config = STATUS_CONFIG[request.status];
              const Icon = config.icon;
              return (
                <>
                  <div className="flex items-center gap-3">
                    <Icon className={`size-8 ${config.color}`} weight="duotone" />
                    <div>
                      <h2 className={`font-display text-lg ${config.color}`}>{config.label}</h2>
                      <p className="text-sm text-muted-foreground">
                        Solicitado em{' '}
                        {new Date(request.requestedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {request.status === 'PENDING' && (
                    <div className="mt-4 rounded-lg bg-white/60 px-4 py-3 text-sm text-muted-foreground">
                      Nossa equipe está analisando seu CRM. Você receberá uma notificação quando a
                      verificação for concluída. Enquanto isso, você pode usar o sistema normalmente
                      com o selo &quot;CRM pendente&quot;.
                    </div>
                  )}

                  {request.status === 'REJECTED' && request.notes && (
                    <div className="mt-4 rounded-lg bg-white/60 px-4 py-3 text-sm">
                      <p className="font-medium text-destructive">Motivo:</p>
                      <p className="mt-1 text-muted-foreground">{request.notes}</p>
                    </div>
                  )}

                  {request.status === 'REJECTED' && (
                    <Button
                      onClick={handleRequest}
                      className="mt-4"
                      disabled={submitting}
                      variant="outline"
                    >
                      <ArrowClockwise className="mr-1 size-4" />
                      {submitting ? 'Enviando...' : 'Solicitar novamente'}
                    </Button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {!loading && !isVerified && !hasRequest && (
          <div className="space-y-4 rounded-xl border border-clinical-line bg-clinical-paper p-5">
            <div className="text-center">
              <SealQuestion className="mx-auto mb-3 size-12 text-clinical-amber" weight="duotone" />
              <h2 className="font-display text-lg text-clinical-ink">CRM não verificado</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Solicite a verificação do seu CRM para que seus documentos tenham selo de
                autenticidade completo.
              </p>
            </div>
            <Button onClick={handleRequest} className="h-11 w-full" disabled={submitting}>
              {submitting ? 'Enviando solicitação...' : 'Solicitar verificação'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
