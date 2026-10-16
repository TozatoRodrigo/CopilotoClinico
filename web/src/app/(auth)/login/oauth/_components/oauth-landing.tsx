'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { WarningCircle } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import { apiClient } from '@/lib/api-client';
import type {
  OAuthCallbackStatus,
  OAuthErrorReason,
  OAuthPendingResponse,
  Physician,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { AuthHeading } from '../../../_components/auth-ui';
import { MfaChallenge } from '../../../_components/mfa-challenge';
import { OAUTH_ERROR_MESSAGES } from './oauth-landing-params';
import { OAuthSignupForm } from './oauth-signup-form';
import { OAuthLinkForm } from './oauth-link-form';

const EXPIRED_MESSAGE = 'O login com o provedor expirou. Entre de novo.';

/**
 * CC-334 — conclui o login com Google/Microsoft conforme o desfecho do
 * callback: sessão aberta (busca o médico e segue), segundo fator, cadastro
 * com CRM ou vínculo com a senha.
 */
export function OAuthLanding({
  status,
  reason,
}: {
  status: OAuthCallbackStatus;
  reason: OAuthErrorReason | null;
}) {
  const router = useRouter();
  const { login } = useAuth();
  // Vínculo com MFA ligado: a senha confirmou, falta o código.
  const [linkMfaToken, setLinkMfaToken] = useState<string | null>(null);

  const hasPendingStep = status === 'mfa' || status === 'signup' || status === 'link';

  // Sessão já aberta pelo callback (cookies): o médico vem de /auth/me.
  const me = useQuery({
    queryKey: ['auth', 'oauth-landing', 'me'],
    queryFn: () => apiClient.get<Physician>('/auth/me'),
    enabled: status === 'ok',
    retry: false,
    gcTime: 0,
  });

  const pending = useQuery({
    queryKey: ['auth', 'oauth-landing', 'pending'],
    queryFn: () => apiClient.get<OAuthPendingResponse>('/auth/oauth/pending'),
    enabled: hasPendingStep,
    retry: false,
    gcTime: 0,
  });

  function finish(
    physician: Physician,
    destination: '/dashboard' | '/onboarding',
    message: string,
  ) {
    login(physician);
    toast.success(message);
    router.replace(destination);
  }

  const signedIn = me.data;
  // Uma vez só (o StrictMode do dev roda o efeito duas vezes).
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!signedIn || finishedRef.current) return;
    finishedRef.current = true;
    login(signedIn);
    toast.success('Login realizado com sucesso!');
    router.replace('/dashboard');
  }, [signedIn, login, router]);

  if (status === 'error') {
    return <OAuthError message={OAUTH_ERROR_MESSAGES[reason ?? 'provider_error']} />;
  }
  if (me.isError) {
    return <OAuthError message="Não conseguimos abrir a sessão. Entre de novo." />;
  }
  if (pending.isError || pending.data?.kind === 'none') {
    return <OAuthError message={EXPIRED_MESSAGE} />;
  }

  if (linkMfaToken) {
    return (
      <MfaChallenge
        mfaToken={linkMfaToken}
        onSuccess={(physician) =>
          finish(physician, '/dashboard', 'Conta vinculada. Da próxima vez, é só entrar com ela.')
        }
        onBack={() => router.replace('/login')}
      />
    );
  }

  const step = pending.data;
  if (step?.kind === 'mfa') {
    return (
      <MfaChallenge
        mfaToken={step.mfaToken}
        onSuccess={(physician) => finish(physician, '/dashboard', 'Login realizado com sucesso!')}
        onBack={() => router.replace('/login')}
      />
    );
  }
  if (step?.kind === 'signup') {
    return (
      <OAuthSignupForm
        pending={step}
        onCreated={(physician) => finish(physician, '/onboarding', 'Conta criada com sucesso!')}
      />
    );
  }
  if (step?.kind === 'link') {
    return (
      <OAuthLinkForm
        pending={step}
        onLinked={(physician) =>
          finish(physician, '/dashboard', 'Conta vinculada. Da próxima vez, é só entrar com ela.')
        }
        onMfaRequired={setLinkMfaToken}
      />
    );
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8" aria-busy="true">
      <AuthHeading title="Entrando…" description="Concluindo o login com o provedor." />
    </div>
  );
}

function OAuthError({ message }: { message: string }) {
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        icon={
          <WarningCircle className="size-10 text-foreground" weight="duotone" aria-hidden="true" />
        }
        title="Não foi possível entrar"
        description={message}
      />
      <Button asChild size="lg" className="w-full">
        <Link href="/login">Voltar ao login</Link>
      </Button>
    </div>
  );
}
