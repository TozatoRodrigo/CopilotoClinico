'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react';
import { apiClient, ApiError } from '@/lib/api-client';
import type {
  AuthResponse,
  OAuthPendingResponse,
  OAuthSignupRequest,
  Physician,
} from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthHeading, subtleLinkClass } from '../../../_components/auth-ui';
import {
  CrmFields,
  CrmPendingNotice,
  PrivacyConsentField,
  type CrmFieldErrors,
} from '../../../_components/signup-fields';
import { OAUTH_PROVIDER_LABEL } from '../../../_components/oauth-buttons';

type SignupStep = Extract<OAuthPendingResponse, { kind: 'signup' }>;

interface FieldErrors extends CrmFieldErrors {
  consent?: string;
}

/**
 * CC-334 — conta nova pelo login com Google/Microsoft. O e-mail é o que o
 * provedor confirmou (não se edita); o CRM é obrigatório como no cadastro
 * por e-mail — a conta só existe depois dele.
 */
export function OAuthSignupForm({
  pending,
  onCreated,
}: {
  pending: SignupStep;
  onCreated: (physician: Physician) => void;
}) {
  const [name, setName] = useState(pending.name ?? '');
  const [crmUf, setCrmUf] = useState('');
  const [crmNumber, setCrmNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const providerLabel = OAUTH_PROVIDER_LABEL[pending.provider];

  function validate(): FieldErrors | null {
    const errors: FieldErrors = {};
    if (!crmUf) errors.crmUf = 'UF obrigatória.';
    if (!crmNumber.trim()) errors.crmNumber = 'Número obrigatório.';
    if (!consent) errors.consent = 'Você precisa aceitar a política de privacidade.';
    return Object.keys(errors).length > 0 ? errors : null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const errors = validate();
    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const body: OAuthSignupRequest = {
        crmUf,
        crmNumber: crmNumber.trim(),
        name: name.trim() || undefined,
      };
      const data = await apiClient.post<AuthResponse>('/auth/oauth/signup', body);
      onCreated(data.physician);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError('Este e-mail já tem cadastro. Volte ao login e entre com ele.');
      } else if (err instanceof ApiError && err.status === 429) {
        setFormError('Muitas tentativas. Aguarde um momento e tente novamente.');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Erro ao criar conta.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        title="Complete seu cadastro"
        description={`Você entrou com ${providerLabel}. Informe seu CRM para criar a conta.`}
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="oauth-email">E-mail</Label>
          <Input
            id="oauth-email"
            type="email"
            value={pending.email}
            readOnly
            disabled
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="oauth-name">Nome (opcional)</Label>
          <Input
            id="oauth-name"
            type="text"
            placeholder="Dr. João Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            disabled={loading}
            className="h-10"
          />
        </div>

        <CrmFields
          crmUf={crmUf}
          crmNumber={crmNumber}
          onCrmUfChange={(value) => {
            setCrmUf(value);
            setFieldErrors((prev) => ({ ...prev, crmUf: undefined }));
          }}
          onCrmNumberChange={(value) => {
            setCrmNumber(value);
            setFieldErrors((prev) => ({ ...prev, crmNumber: undefined }));
          }}
          errors={fieldErrors}
          disabled={loading}
        />

        <CrmPendingNotice />

        <PrivacyConsentField
          checked={consent}
          onChange={(checked) => {
            setConsent(checked);
            setFieldErrors((prev) => ({ ...prev, consent: undefined }));
          }}
          error={fieldErrors.consent}
          disabled={loading}
        />

        {formError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="mt-1 w-full" loading={loading}>
          Criar conta com CRM
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Não é você?{' '}
        <Link href="/login" className={subtleLinkClass}>
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
