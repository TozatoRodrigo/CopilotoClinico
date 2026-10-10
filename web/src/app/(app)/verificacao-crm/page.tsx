'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import {
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Circle,
  CircleDashed,
  CircleNotch,
  Clock,
  IdentificationCard,
  ListChecks,
  SealCheck,
  ShieldCheck,
  UserCircle,
  WarningCircle,
  XCircle,
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

  const requestedAt = request?.requestedAt
    ? new Date(request.requestedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Page width="narrow">
      <PageHeader
        icon={IdentificationCard}
        iconTone={isVerified ? 'green' : 'gray'}
        eyebrow={isVerified ? undefined : 'Passo 2 de 3 · menos de 1 minuto'}
        title={isVerified ? 'CRM verificado' : 'Verificando seu CRM'}
        description={
          isVerified ? (
            'Seu registro está ativo no CFM. Não há nada a fazer aqui.'
          ) : (
            <>
              Consultamos o CFM automaticamente.{' '}
              <span className="font-medium text-foreground">Você não precisa esperar</span> — pode
              começar o plantão agora; documentos confirmados antes da verificação ficam marcados
              como pendentes.
            </>
          )
        }
        properties={
          <PropertyList>
            <PropertyRow icon={ListChecks} label="Etapa">
              <ProgressSteps
                steps={['Conta', 'CRM', 'Plantão']}
                currentStep={isVerified ? 2 : 1}
                className="-ml-1.5"
              />
            </PropertyRow>
            <PropertyRow icon={UserCircle} label="Médico">
              Dr(a). {physician.name ?? 'Médico'}
            </PropertyRow>
            <PropertyRow icon={IdentificationCard} label="CRM">
              <span className="font-mono">
                {physician.crmUf}-{physician.crmNumber}
              </span>
            </PropertyRow>
            <PropertyRow icon={CircleDashed} label="Status">
              {isVerified ? (
                <Badge variant="success">
                  <SealCheck weight="fill" aria-hidden="true" /> Verificado
                </Badge>
              ) : loading ? (
                <Badge variant="secondary">
                  <CircleNotch className="animate-spin" aria-hidden="true" /> Carregando…
                </Badge>
              ) : isPending ? (
                <Badge variant="default">
                  <CircleNotch className="animate-spin" aria-hidden="true" /> Consultando CFM…
                </Badge>
              ) : isRejected ? (
                <Badge variant="destructive">Rejeitada</Badge>
              ) : (
                <Badge variant="warning">Pendente</Badge>
              )}
            </PropertyRow>
            {requestedAt && !isVerified && (
              <PropertyRow icon={Clock} label="Solicitado em">
                {requestedAt}
              </PropertyRow>
            )}
          </PropertyList>
        }
      />

      {/* O que fazer agora — o callout muda com o estado da verificação. */}
      {!isVerified && !loading && isPending && (
        <Callout tone="blue" icon={<CircleNotch className="animate-spin" />} title="Consulta ao CFM em andamento">
          Avisamos por notificação quando a verificação concluir · normalmente &lt; 2 min. Você
          pode atender enquanto isso.
        </Callout>
      )}

      {!hasRequest && !isVerified && !loading && (
        <Callout
          tone="orange"
          icon={<WarningCircle weight="fill" />}
          title="Ainda não solicitou verificação?"
          action={
            <Button
              variant="outline"
              size="sm"
              className="max-sm:h-10"
              onClick={() => handleRequest()}
              loading={submitting}
            >
              Solicitar verificação de CRM
            </Button>
          }
        >
          Envie a solicitação para conferirmos seu registro no CFM. Até lá, documentos confirmados
          ficam marcados como pendentes.
        </Callout>
      )}

      {isRejected && (
        <Callout
          tone="red"
          icon={<XCircle weight="fill" />}
          title="Verificação rejeitada"
          action={
            <Button
              variant="outline"
              size="sm"
              className="max-sm:h-10"
              onClick={() => handleRequest()}
              loading={submitting}
            >
              Solicitar novamente
            </Button>
          }
        >
          {request?.notes ?? 'Confira o número e a UF do seu CRM e solicite novamente.'}
        </Callout>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader title="Etapas" as="h2" />
        <ul className="flex flex-col">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 py-1.5 text-sm">
              {item.done ? (
                <CheckCircle className="size-[18px] shrink-0 text-tone-green" weight="fill" aria-hidden="true" />
              ) : (
                <Circle className="size-[18px] shrink-0 text-fg-tertiary" aria-hidden="true" />
              )}
              <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
              <span className="sr-only">{item.done ? '— concluído' : '— pendente'}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="sm:flex-1" onClick={() => router.push('/dashboard')}>
            Começar o plantão agora
            <ArrowRight weight="bold" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => loadRequest()}
            disabled={loading}
          >
            <ArrowsClockwise />
            Atualizar
          </Button>
        </div>
        {!isPending && !isVerified && (
          <p className="text-xs text-muted-foreground">
            Avisamos por notificação quando a verificação concluir · normalmente &lt; 2 min
          </p>
        )}
      </div>

      {/* Trust footer */}
      <p className="flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Seus dados são protegidos conforme a LGPD.
      </p>
    </Page>
  );
}
