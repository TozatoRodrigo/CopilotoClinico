'use client';

import { useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthResponse } from '@/lib/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ShieldCheck, Warning } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

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

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Fraca', color: 'bg-clinical-error' };
  if (score <= 3) return { score, label: 'Média', color: 'bg-clinical-amber' };
  return { score, label: 'Forte', color: 'bg-clinical-green' };
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

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);
  const strengthPercent = (strength.score / 5) * 100;

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
          toast.error(err.message);
        }
      } else {
        toast.error('Erro ao criar conta.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl tracking-tight text-clinical-ink">Criar Conta</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre-se com seu CRM para usar o Copiloto Clínico
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome (opcional)</Label>
          <Input
            id="name"
            type="text"
            placeholder="Dr. João Silva"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            autoComplete="name"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
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
          />
          {fieldErrors.email && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <Warning className="size-3" />
              {fieldErrors.email}
            </p>
          )}
          {emailExists && (
            <p className="text-sm text-muted-foreground">
              Já tem conta?{' '}
              <Link href="/login" className="text-clinical-teal underline underline-offset-4">
                Faça login
              </Link>
            </p>
          )}
        </div>

        <div className="space-y-2">
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
          />
          {fieldErrors.password && (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          )}
          {form.password && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-clinical-line">
                <div
                  className={cn('h-full rounded-full transition-all', strength.color)}
                  style={{ width: `${strengthPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Força: {strength.label}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>CRM UF</Label>
            <Select
              value={form.crmUf}
              onValueChange={(value) => updateField('crmUf', value)}
              disabled={loading}
            >
              <SelectTrigger className="w-full" aria-invalid={!!fieldErrors.crmUf}>
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
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="crmNumber">Número do CRM</Label>
            <Input
              id="crmNumber"
              type="text"
              placeholder="12345"
              value={form.crmNumber}
              onChange={(e) => updateField('crmNumber', e.target.value)}
              disabled={loading}
              aria-invalid={!!fieldErrors.crmNumber}
            />
          </div>
        </div>

        <div className="rounded-lg border border-clinical-amber/30 bg-clinical-amber-bg px-3 py-2">
          <p className="flex items-start gap-2 text-xs text-clinical-amber-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-clinical-amber" />
            Seu CRM será verificado. Até a aprovação, seus documentos terão selo &quot;CRM
            pendente&quot; — você pode usar o sistema normalmente.
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setFieldErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              disabled={loading}
              className="mt-0.5 size-4 rounded border-clinical-line accent-clinical-teal"
            />
            <span className="text-sm text-muted-foreground">
              Li e aceito a{' '}
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-clinical-teal underline underline-offset-4"
              >
                Política de Privacidade
              </Link>
              . Meus dados serão processados conforme a LGPD para prestação deste serviço médico.
            </span>
          </label>
          {fieldErrors.consent && <p className="text-xs text-destructive">{fieldErrors.consent}</p>}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? 'Criando conta...' : 'Criar conta com CRM'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link href="/login" className="text-clinical-teal underline underline-offset-4">
            Faça login
          </Link>
        </p>
      </form>
    </div>
  );
}
