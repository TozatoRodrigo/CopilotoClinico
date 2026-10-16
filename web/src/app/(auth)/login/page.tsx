'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthResponse, Physician } from '@/lib/types';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EnvelopeSimple, Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react';
import { AuthHeading, FieldError, subtleLinkClass } from '../_components/auth-ui';
import { MfaChallenge } from '../_components/mfa-challenge';
import { OAuthButtons } from '../_components/oauth-buttons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'credentials' | 'mfa';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  // Erro da tentativa de login (API) — mostrado em linha, acima do botão.
  const [formError, setFormError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);

  function finishLogin(physician: Physician) {
    login(physician);
    toast.success('Login realizado com sucesso!');
    router.push('/dashboard');
  }

  function validateCredentials(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email) errors.email = 'E-mail é obrigatório.';
    else if (!EMAIL_REGEX.test(email)) errors.email = 'Formato de e-mail inválido.';
    if (!password) errors.password = 'Senha é obrigatória.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!validateCredentials()) return;

    setLoading(true);
    try {
      const data = await apiClient.post<
        { mfaRequired?: boolean; mfaToken?: string } & AuthResponse
      >('/auth/login', { email, password });

      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        setStep('mfa');
      } else {
        finishLogin(data.physician);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setFormError('Muitas tentativas. Aguarde um momento e tente novamente.');
        } else if (err.status === 401) {
          // O apiClient troca a mensagem de todo 401 por "Sessão expirada" —
          // aqui o 401 significa e-mail/senha incorretos.
          setFormError('Credenciais inválidas.');
        } else {
          setFormError(err.message || 'Credenciais inválidas.');
        }
      } else {
        setFormError('Erro ao fazer login.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (step === 'mfa') {
    return (
      <MfaChallenge
        mfaToken={mfaToken}
        onSuccess={finishLogin}
        onBack={() => setStep('credentials')}
      />
    );
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        title="Entrar no Copiloto Clínico"
        description="Use o e-mail e a senha da sua conta."
      />

      {/* CC-334 — só aparece com Google/Microsoft configurados na API. */}
      <OAuthButtons verb="Entrar" />

      <form onSubmit={handleCredentialsSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
            autoComplete="email"
            disabled={loading}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className="h-10"
          />
          {fieldErrors.email && <FieldError id="email-error">{fieldErrors.email}</FieldError>}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Senha</Label>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="-my-2 rounded-sm px-1 py-2 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              Esqueci a senha
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Sua senha"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
              autoComplete="current-password"
              disabled={loading}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              className="h-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 max-sm:right-0 max-sm:size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldErrors.password && <FieldError id="password-error">{fieldErrors.password}</FieldError>}
        </div>

        {formError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="mt-1 w-full" loading={loading}>
          Entrar
        </Button>
      </form>

      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm text-muted-foreground">
          Primeira vez aqui?{' '}
          <Link href="/register" className={subtleLinkClass}>
            Criar conta com CRM
          </Link>
        </p>
        <p className="max-w-[300px] text-xs text-pretty text-muted-foreground">
          Acesso restrito a médicos com CRM. Seus dados são tratados conforme a{' '}
          <Link href="/privacidade" className={subtleLinkClass}>
            Política de Privacidade
          </Link>{' '}
          (LGPD).
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle variant="brand">Recuperar senha</DialogTitle>
            <DialogDescription>
              O reset automático por email será ativado em breve. Por enquanto, entre em contato com o suporte para redefinir sua senha.
            </DialogDescription>
          </DialogHeader>
          <a
            href="mailto:suporte@strivum.com.br?subject=Reset%20de%20senha%20Copiloto%20Cl%C3%ADnico"
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <EnvelopeSimple className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">suporte@strivum.com.br</p>
              <p className="text-xs text-muted-foreground">Resposta em até 1 dia útil. Inclua seu CRM para verificação.</p>
            </div>
          </a>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
