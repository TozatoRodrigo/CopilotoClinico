'use client';

import { useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthResponse } from '@/lib/types';
import { LogoMark } from '@/components/brand/logo';
import {
  BetaInviteField,
  BetaWaitlistPanel,
  useBetaRegistration,
} from '../_components/beta-registration';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { AuthHeading, FieldError, subtleLinkClass } from '../_components/auth-ui';
import {
  CrmFields,
  CrmPendingNotice,
  PrivacyConsentField,
} from '../_components/signup-fields';
import { OAuthButtons } from '../_components/oauth-buttons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  name: string;
  email: string;
  password: string;
  crmUf: string;
  crmNumber: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
  crmUf?: string;
  crmNumber?: string;
  consent?: string;
}

const PASSWORD_SEGMENTS = 5;

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Fraca', color: 'bg-tone-red' };
  if (score <= 3) return { score, label: 'Média', color: 'bg-tone-yellow' };
  return { score, label: 'Forte', color: 'bg-tone-green' };
}

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  // CC-702 — convite do beta (BETA_INVITE_REQUIRED) e lista de espera.
  const beta = useBetaRegistration();
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    password: '',
    crmUf: '',
    crmNumber: '',
  });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [emailExists, setEmailExists] = useState(false);
  // Erro do cadastro vindo da API — mostrado em linha, acima do botão.
  const [formError, setFormError] = useState('');

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  // Depois dos hooks: o beta decide a tela (lista de espera ou cadastro).
  if (beta.loading) {
    return (
      <div className="flex justify-center pt-16" role="status" aria-label="Carregando">
        <LogoMark size="lg" className="animate-pulse" />
      </div>
    );
  }

  if (beta.view === 'waitlist') {
    return <BetaWaitlistPanel onHaveInvite={beta.showForm} />;
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    if (key === 'email') setEmailExists(false);
  }

  function validate(): FieldErrors | null {
    const errors: FieldErrors = {};
    if (!form.email) errors.email = 'E-mail é obrigatório.';
    else if (!EMAIL_REGEX.test(form.email)) errors.email = 'Formato de e-mail inválido.';
    if (!form.password) errors.password = 'Senha é obrigatória.';
    else if (form.password.length < 8) errors.password = 'Mínimo 8 caracteres.';
    else if (!/[A-Z]/.test(form.password)) errors.password = 'Inclua uma letra maiúscula.';
    else if (!/[a-z]/.test(form.password)) errors.password = 'Inclua uma letra minúscula.';
    else if (!/\d/.test(form.password)) errors.password = 'Inclua um dígito.';
    else if (!/[^A-Za-z0-9]/.test(form.password)) errors.password = 'Inclua um caractere especial.';
    if (!form.crmUf) errors.crmUf = 'UF obrigatória.';
    if (!form.crmNumber) errors.crmNumber = 'Número obrigatório.';
    if (!consent) errors.consent = 'Você precisa aceitar a política de privacidade.';
    return Object.keys(errors).length > 0 ? errors : null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const errors = validate();
    const inviteOk = beta.validateInvite();
    if (errors || !inviteOk) {
      if (errors) setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const data = await apiClient.post<AuthResponse>('/auth/register', {
        name: form.name || undefined,
        email: form.email,
        password: form.password,
        crmUf: form.crmUf,
        crmNumber: form.crmNumber,
        inviteCode: beta.inviteCodeForRequest,
      });
      login(data.physician);
      toast.success('Conta criada com sucesso!');
      // Quem entrou por convite segue para o onboarding do beta.
      router.push(beta.inviteCodeForRequest ? '/onboarding/beta' : '/onboarding');
    } catch (err) {
      if (beta.handleRegisterError(err)) return;
      if (err instanceof ApiError) {
        if (
          err.message.toLowerCase().includes('email') &&
          err.message.toLowerCase().includes('exist')
        ) {
          setEmailExists(true);
          setFieldErrors({ email: 'Este e-mail já está cadastrado.' });
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Erro ao criar conta.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        title="Crie sua conta"
        description="Cadastre-se com seu CRM para usar o Copiloto Clínico."
      />

      {/* CC-334 — o CRM é pedido depois, na volta do provedor. */}
      <OAuthButtons verb="Cadastrar" />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {beta.showInviteField && (
          <BetaInviteField
            value={beta.inviteCode}
            onChange={beta.setInviteCode}
            error={beta.inviteError}
            validFromLink={beta.inviteValidFromLink}
            required={beta.inviteRequired}
            disabled={loading}
            onJoinWaitlist={beta.inviteRequired ? beta.showWaitlist : undefined}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome (opcional)</Label>
          <Input
            id="name"
            type="text"
            placeholder="Dr. João Silva"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            autoComplete="name"
            disabled={loading}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            autoComplete="email"
            disabled={loading}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className="h-10"
          />
          {fieldErrors.email && <FieldError id="email-error">{fieldErrors.email}</FieldError>}
          {emailExists && (
            <p className="text-[0.8125rem] text-muted-foreground">
              Já tem conta?{' '}
              <Link href="/login" className={subtleLinkClass}>
                Faça login
              </Link>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            autoComplete="new-password"
            disabled={loading}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error password-hint' : 'password-hint'}
            className="h-10"
          />
          {fieldErrors.password && (
            <FieldError id="password-error">{fieldErrors.password}</FieldError>
          )}
          {form.password ? (
            <div id="password-hint" className="flex items-center gap-2.5">
              <div aria-hidden="true" className="flex flex-1 gap-1">
                {Array.from({ length: PASSWORD_SEGMENTS }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      i < strength.score ? strength.color : 'bg-tone-gray-tag',
                    )}
                  />
                ))}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">Força: {strength.label}</p>
            </div>
          ) : (
            <p id="password-hint" className="text-xs text-muted-foreground">
              Use maiúscula, minúscula, número e símbolo.
            </p>
          )}
        </div>

        <CrmFields
          crmUf={form.crmUf}
          crmNumber={form.crmNumber}
          onCrmUfChange={(value) => updateField('crmUf', value)}
          onCrmNumberChange={(value) => updateField('crmNumber', value)}
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
        Já tem conta?{' '}
        <Link href="/login" className={subtleLinkClass}>
          Faça login
        </Link>
      </p>
    </div>
  );
}
