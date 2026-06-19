'use client';

import { useState, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthResponse } from '@/lib/types';
import { toast } from 'sonner';
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
import { ShieldCheck, ArrowLeft, EnvelopeSimple } from '@phosphor-icons/react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'credentials' | 'mfa';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState(['', '', '', '', '', '']);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [mfaError, setMfaError] = useState('');
  // S24-AUTH-01 — dialog "Esqueci a senha"
  const [forgotOpen, setForgotOpen] = useState(false);

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const setDigitRef = useCallback(
    (idx: number) => (el: HTMLInputElement | null) => {
      digitRefs.current[idx] = el;
    },
    [],
  );

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
    if (!validateCredentials()) return;

    setLoading(true);
    try {
      const data = await apiClient.post<
        { mfaRequired?: boolean; mfaToken?: string } & AuthResponse
      >('/auth/login', { email, password });

      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        setStep('mfa');
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
      } else {
        login(data.physician);
        toast.success('Login realizado com sucesso!');
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          toast.error('Muitas tentativas. Aguarde um momento e tente novamente.');
        } else {
          toast.error(err.message || 'Credenciais inválidas.');
        }
      } else {
        toast.error('Erro ao fazer login.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(idx: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...mfaCode];
      digits.forEach((d, i) => {
        if (idx + i < 6) newCode[idx + i] = d;
      });
      setMfaCode(newCode);
      const focusIdx = Math.min(idx + digits.length, 5);
      digitRefs.current[focusIdx]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newCode = [...mfaCode];
    newCode[idx] = digit;
    setMfaCode(newCode);
    setMfaError('');

    if (digit && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }
  }

  function handleDigitKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !mfaCode[idx] && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
      const newCode = [...mfaCode];
      newCode[idx - 1] = '';
      setMfaCode(newCode);
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = pasted.split('');
    const newCode = [...mfaCode];
    digits.forEach((d, i) => {
      if (i < 6) newCode[i] = d;
    });
    setMfaCode(newCode);
    digitRefs.current[Math.min(digits.length - 1, 5)]?.focus();
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    const code = useBackup ? backupCode.trim() : mfaCode.join('');
    if (!code) {
      setMfaError(useBackup ? 'Insira o código de recuperação.' : 'Insira o código de 6 dígitos.');
      return;
    }

    setLoading(true);
    setMfaError('');
    try {
      const data = await apiClient.post<AuthResponse>('/auth/mfa/verify', {
        mfaToken,
        code,
      });
      login(data.physician);
      toast.success('Login realizado com sucesso!');
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setMfaError('Muitas tentativas. Aguarde e tente novamente.');
      } else {
        setMfaError('Código inválido. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (step === 'mfa') {
    return (
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
            Verificação em duas etapas
          </h1>
          <p className="text-sm text-muted-foreground">
            Abra seu app autenticador e insira o código de 6 dígitos.
          </p>
        </div>

        <form onSubmit={handleMfaSubmit} className="space-y-6">
          {!useBackup ? (
            <fieldset className="space-y-3">
              <legend className="sr-only">Código de verificação de 6 dígitos</legend>
              {/*
                S22-A11Y-02 — OTP responsivo. Antes era `size-12` fixo (6×48 + gaps
                = 328px), estourando iPhone SE (320px). Agora `size-10` no mobile
                (6×40 + gaps = 280px) e `size-12` no desktop. `gap-1.5 sm:gap-2`
                para ajustar fino.
              */}
              <div className="flex justify-center gap-1.5 sm:gap-2">
                {mfaCode.map((digit, idx) => (
                  <Input
                    key={idx}
                    ref={setDigitRef(idx)}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    onPaste={handleDigitPaste}
                    disabled={loading}
                    className="size-10 select-none p-0 text-center text-lg font-semibold tabular-nums sm:size-12 sm:text-xl"
                    aria-label={`Dígito ${idx + 1} de 6`}
                  />
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="backupCode">Código de recuperação</Label>
              <Input
                id="backupCode"
                type="text"
                placeholder="Código de recuperação"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  setMfaError('');
                }}
                disabled={loading}
                autoComplete="off"
              />
            </div>
          )}

          {mfaError && (
            <p role="alert" className="text-center text-sm text-destructive">
              {mfaError}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? 'Verificando...' : 'Verificar'}
          </Button>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUseBackup(!useBackup);
                setMfaError('');
              }}
              className="text-sm text-clinical-teal underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
            >
              {useBackup ? 'Usar código do app autenticador' : 'Usar código de recuperação'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setMfaCode(['', '', '', '', '', '']);
                setMfaError('');
                setUseBackup(false);
              }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-clinical-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
            >
              <ArrowLeft className="size-3" />
              Voltar ao login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl tracking-tight text-clinical-ink">Copiloto Clínico</h1>
        <p className="text-sm text-muted-foreground">Faça login para acessar o sistema</p>
      </div>

      <form onSubmit={handleCredentialsSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoComplete="email"
            disabled={loading}
            aria-invalid={!!fieldErrors.email}
          />
          {fieldErrors.email && (
            <p role="alert" className="text-xs text-destructive">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            {/*
              S24-AUTH-01 — "Esqueci a senha". Ainda não temos fluxo de reset
              por email (precisa SMTP configurado + tabela de tokens); o link
              abre um Dialog explicando como obter suporte. Quando o backend
              tiver /auth/password/forgot, troca por um form de email.
            */}
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs text-clinical-teal underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
            >
              Esqueci a senha
            </button>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            autoComplete="current-password"
            disabled={loading}
            aria-invalid={!!fieldErrors.password}
          />
          {fieldErrors.password && (
            <p role="alert" className="text-xs text-destructive">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-clinical-teal/20 bg-clinical-teal-tint px-3 py-2">
          <ShieldCheck className="size-4 shrink-0 text-clinical-teal" />
          <p className="text-xs text-muted-foreground">
            Autenticação de dois fatores obrigatória para médicos.
          </p>
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{' '}
          <Link href="/register" className="text-clinical-teal underline underline-offset-4">
            Cadastre-se
          </Link>
        </p>
      </form>

      {/*
        S24-AUTH-01 — Dialog "Esqueci a senha". Fluxo real de reset por email
        exige backend com SMTP + tabela de tokens (Sprint 25+). Por enquanto,
        orienta o médico a contactar o suporte — honesto, sem criar endpoint
        fake que confunda.
      */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle variant="brand">Recuperar senha</DialogTitle>
            <DialogDescription>
              O reset automático por email será ativado em breve. Por enquanto,
              entre em contato com o suporte para redefinir sua senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <a
              href="mailto:suporte@strivum.com.br?subject=Reset%20de%20senha%20Copiloto%20Cl%C3%ADnico"
              className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <EnvelopeSimple className="size-5 shrink-0 text-clinical-teal" weight="duotone" />
              <div>
                <p className="text-sm font-medium">suporte@strivum.com.br</p>
                <p className="text-xs text-muted-foreground">
                  Resposta em até 1 dia útil. Inclua seu CRM para verificação.
                </p>
              </div>
            </a>
            <p className="text-xs text-muted-foreground">
              Se você esqueceu apenas o código MFA, use um código de backup.
              Sem backup? O suporte pode resetar o MFA mediante verificação de identidade.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
