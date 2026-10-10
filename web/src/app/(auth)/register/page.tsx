'use client';

import { useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthResponse } from '@/lib/types';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IdentificationCard, WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { AuthHeading, FieldError, subtleLinkClass } from '../_components/auth-ui';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRM_UF_OPTIONS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

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
    if (errors) {
      setFieldErrors(errors);
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
      });
      login(data.physician);
      toast.success('Conta criada com sucesso!');
      router.push('/onboarding');
    } catch (err) {
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

  const crmError = fieldErrors.crmUf ?? fieldErrors.crmNumber;

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        title="Crie sua conta"
        description="Cadastre-se com seu CRM para usar o Copiloto Clínico."
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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

        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Label htmlFor="crmUf">UF do CRM</Label>
            <Label htmlFor="crmNumber">Número do CRM</Label>
          </div>
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Select
              value={form.crmUf}
              onValueChange={(value) => updateField('crmUf', value)}
              disabled={loading}
            >
              <SelectTrigger
                id="crmUf"
                className="w-full data-[size=default]:h-10"
                aria-invalid={!!fieldErrors.crmUf}
                aria-describedby={crmError ? 'crm-error' : undefined}
              >
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                {CRM_UF_OPTIONS.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="crmNumber"
              type="text"
              inputMode="numeric"
              placeholder="12345"
              value={form.crmNumber}
              onChange={(e) => updateField('crmNumber', e.target.value)}
              disabled={loading}
              aria-invalid={!!fieldErrors.crmNumber}
              aria-describedby={crmError ? 'crm-error' : undefined}
              className="h-10"
            />
          </div>
          {crmError && (
            <FieldError id="crm-error">
              {[fieldErrors.crmUf, fieldErrors.crmNumber].filter(Boolean).join(' ')}
            </FieldError>
          )}
        </div>

        <Callout tone="blue" icon={<IdentificationCard />} className="text-[0.8125rem]">
          Seu CRM será verificado. Até a aprovação, seus documentos terão selo &quot;CRM
          pendente&quot; — você pode usar o sistema normalmente.
        </Callout>

        <div className="flex flex-col gap-1.5">
          <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setFieldErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              disabled={loading}
              aria-invalid={!!fieldErrors.consent}
              aria-describedby={fieldErrors.consent ? 'consent-error' : undefined}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
            />
            <span className="text-[0.8125rem] text-muted-foreground">
              Li e aceito a{' '}
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className={subtleLinkClass}
              >
                Política de Privacidade
              </Link>
              . Meus dados serão processados conforme a LGPD para prestação deste serviço médico.
            </span>
          </label>
          {fieldErrors.consent && (
            <FieldError id="consent-error">{fieldErrors.consent}</FieldError>
          )}
        </div>

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
