'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Stethoscope,
  SealCheck,
  CheckCircle,
  Circle,
  CircleNotch,
  ArrowRight,
  IdentificationCard,
  ShieldCheck,
} from '@phosphor-icons/react';

interface VerificationRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  resolvedAt: string | null;
  notes: string | null;
}

export default function CrmVerificationPage() {
  const { physician } = useAuth();
  const router = useRouter();
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
      // silent — may not have a request yet
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
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Erro ao solicitar verificação.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!physician) return null;

  const isVerified = physician.crmVerified;
  const isPending = request?.status === 'PENDING';
  const isRejected = request?.status === 'REJECTED';
  const hasRequest = request !== null;

  const checklist = [
    { done: true, label: 'Formato do CRM válido' },
    { done: true, label: 'Conta criada com sucesso' },
    { done: isVerified, label: 'Registro ativo no CFM' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex w-full items-center justify-between px-10 py-6">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]"
            style={{ background: 'var(--sidebar-dark-bg)' }}
          >
            <Stethoscope className="h-[18px] w-[18px]" style={{ color: 'var(--sidebar-dark-accent)' }} />
          </span>
          <p className="text-sm font-semibold">Copiloto Clínico</p>
        </div>

        {/* Progress steps */}
        <div className="hidden items-center gap-2.5 md:flex">
          <div className="flex items-center gap-2">
            <span className="h-[5px] w-6 rounded-[3px] bg-clinical-green" />
            <span className="text-xs text-clinical-green-foreground">Conta</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-[5px] w-6 rounded-[3px] bg-clinical-teal" />
            <span className="text-xs font-semibold text-clinical-ink">CRM</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-[5px] w-6 rounded-[3px] bg-clinical-line" />
            <span className="text-xs text-muted-foreground">Plantão</span>
          </div>
        </div>
      </header>

      {/* Center content */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-[560px] space-y-5">
          <div>
            <p className="mb-1.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Passo 2 de 3 · menos de 1 minuto
            </p>
            <h1 className="font-display text-[2.1rem] font-normal leading-tight">
              Verificando seu CRM
            </h1>
            <p className="mt-2.5 text-[0.9rem] leading-relaxed text-muted-foreground">
              Consultamos o CFM automaticamente.{' '}
              <span className="font-semibold text-clinical-ink">Você não precisa esperar</span> —
              pode começar o plantão agora; documentos confirmados antes da verificação ficam
              marcados como pendentes.
            </p>
          </div>

          {/* Verification card */}
          <div className="rounded-2xl border border-clinical-line bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-clinical-teal-tint">
                <IdentificationCard className="h-6 w-6 text-clinical-teal-deep" />
              </span>
              <div className="flex-1">
                <p className="text-[0.95rem] font-semibold">
                  Dr(a). {physician.name ?? 'Médico'}
                </p>
                <p className="mt-0.5 font-mono text-[0.8rem] text-muted-foreground">
                  CRM {physician.crmUf}-{physician.crmNumber}
                </p>
              </div>
              {isVerified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-clinical-green-bg px-3 py-1 text-xs font-semibold text-clinical-green-foreground">
                  <SealCheck className="size-3.5" weight="fill" /> Verificado
                </span>
              ) : loading ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  <CircleNotch className="size-3.5 animate-spin" /> Carregando…
                </span>
              ) : isPending ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-clinical-teal-tint px-3 py-1 text-xs font-semibold text-clinical-teal-deep">
                  <CircleNotch className="size-3.5 animate-spin" /> Consultando CFM…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-clinical-amber-bg px-3 py-1 text-xs font-semibold text-clinical-amber-foreground">
                  Pendente
                </span>
              )}
            </div>

            {/* Checklist */}
            <div className="mt-4 flex flex-col gap-2 border-t border-clinical-line pt-3.5">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-[0.8rem]">
                  {item.done ? (
                    <CheckCircle className="size-[15px] text-clinical-green" weight="fill" />
                  ) : (
                    <Circle className="size-[15px] text-muted-foreground" />
                  )}
                  <span className={item.done ? 'text-clinical-ink' : 'text-muted-foreground'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <Button
              className="h-[54px] flex-1 gap-2 text-[0.95rem] font-semibold shadow-[0_4px_14px_rgba(14,124,123,0.3)]"
              onClick={() => router.push('/dashboard')}
            >
              Começar o plantão agora
              <ArrowRight className="size-4" weight="bold" />
            </Button>
            <Button
              variant="outline"
              className="h-[54px] px-5 text-[0.85rem]"
              onClick={() => loadRequest()}
              disabled={loading}
            >
              Atualizar
            </Button>
          </div>

          {!hasRequest && !isVerified && !loading && (
            <div className="rounded-xl border border-clinical-line bg-clinical-paper p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Ainda não solicitou verificação?
              </p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => handleRequest()}
                disabled={submitting}
              >
                {submitting ? 'Enviando...' : 'Solicitar verificação de CRM'}
              </Button>
            </div>
          )}

          {isRejected && request?.notes && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Verificação rejeitada</p>
              <p className="mt-1 text-sm text-muted-foreground">{request.notes}</p>
              <Button variant="outline" className="mt-3" onClick={() => handleRequest()} disabled={submitting}>
                {submitting ? 'Enviando...' : 'Solicitar novamente'}
              </Button>
            </div>
          )}

          <p className="text-center text-[0.75rem] text-muted-foreground">
            Avisamos por notificação quando a verificação concluir · normalmente &lt; 2 min
          </p>

          {/* Trust footer */}
          <div className="flex items-center justify-center gap-2 pt-2 text-[0.75rem] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-clinical-teal" />
            Seus dados são protegidos conforme a LGPD.
          </div>
        </div>
      </div>
    </div>
  );
}
