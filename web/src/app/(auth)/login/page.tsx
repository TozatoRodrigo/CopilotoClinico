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
import {
  Stethoscope,
  SealCheck,
  ShieldCheck,
  LockKey,
  ArrowLeft,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  CaretDown,
  DeviceMobileCamera,
} from '@phosphor-icons/react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

type Step = 'credentials' | 'mfa';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [crmUf, setCrmUf] = useState('SP');
  const [crmNumber, setCrmNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSession, setKeepSession] = useState(true);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState(['', '', '', '', '', '']);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [mfaError, setMfaError] = useState('');
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
      digits.forEach((d, i) => { if (idx + i < 6) newCode[idx + i] = d; });
      setMfaCode(newCode);
      digitRefs.current[Math.min(idx + digits.length, 5)]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '');
    const newCode = [...mfaCode];
    newCode[idx] = digit;
    setMfaCode(newCode);
    setMfaError('');
    if (digit && idx < 5) digitRefs.current[idx + 1]?.focus();
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
    digits.forEach((d, i) => { if (i < 6) newCode[i] = d; });
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
      const data = await apiClient.post<AuthResponse>('/auth/mfa/verify', { mfaToken, code });
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
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
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
                <Input id="backupCode" type="text" placeholder="Código de recuperação" value={backupCode}
                  onChange={(e) => { setBackupCode(e.target.value); setMfaError(''); }}
                  disabled={loading} autoComplete="off" />
              </div>
            )}
            {mfaError && <p role="alert" className="text-center text-sm text-destructive">{mfaError}</p>}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? 'Verificando...' : 'Verificar'}
            </Button>
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={() => { setUseBackup(!useBackup); setMfaError(''); }}
                className="text-sm text-clinical-teal underline underline-offset-4">
                {useBackup ? 'Usar código do app autenticador' : 'Usar código de recuperação'}
              </button>
              <button type="button" onClick={() => { setStep('credentials'); setMfaCode(['', '', '', '', '', '']); setMfaError(''); setUseBackup(false); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-clinical-ink">
                <ArrowLeft className="size-3" /> Voltar ao login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div
        className="hidden w-[520px] shrink-0 flex-col p-12 md:flex"
        style={{ background: 'var(--sidebar-dark-bg)', color: 'var(--sidebar-dark-text)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px]"
            style={{ background: 'var(--sidebar-dark-bg-elevated)' }}
          >
            <Stethoscope className="h-5 w-5" style={{ color: 'var(--sidebar-dark-accent)' }} />
          </span>
          <p className="text-[0.95rem] font-semibold" style={{ color: 'var(--sidebar-dark-text-bright)' }}>
            Copiloto Clínico
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-5">
          <h2
            className="font-display text-[2.5rem] font-normal leading-[1.15]"
            style={{ color: 'var(--sidebar-dark-text-bright)' }}
          >
            Você não está sozinho no plantão
          </h2>
          <p
            className="max-w-[360px] text-[0.95rem] leading-relaxed"
            style={{ color: 'var(--sidebar-dark-text-muted)' }}
          >
            SOAP, SBAR e prescrições geradas do seu ditado, com evidência citada e trilha de auditoria inviolável.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {[
            { icon: SealCheck, text: 'Toda conduta é confirmada por você, e fica registrada' },
            { icon: ShieldCheck, text: 'Nenhum dado pessoal do paciente sai daqui' },
            { icon: LockKey, text: 'Trilha de auditoria verificada todos os dias' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5 text-[0.8rem]" style={{ color: 'var(--sidebar-dark-text-muted)' }}>
              <Icon className="h-[15px] w-[15px] fill" style={{ color: 'var(--sidebar-dark-accent)' }} />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px] space-y-5">
          <div>
            <h1 className="font-display text-[1.875rem] font-normal">Entrar</h1>
            <p className="mt-1.5 text-[0.85rem] text-muted-foreground">
              Use o CRM cadastrado pelo seu hospital.
            </p>
          </div>

          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
            {/* CRM visual identity */}
            <div className="space-y-2">
              <Label className="text-[0.8rem] font-semibold">CRM</Label>
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={crmUf}
                    onChange={(e) => setCrmUf(e.target.value)}
                    disabled={loading}
                    aria-label="Estado do CRM"
                    className="flex h-[52px] w-[96px] appearance-none items-center justify-between rounded-[12px] border border-clinical-line bg-card px-3.5 pr-9 text-[0.95rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {BR_STATES.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                  <CaretDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={crmNumber}
                  onChange={(e) => setCrmNumber(e.target.value.replace(/\D/g, ''))}
                  disabled={loading}
                  className="h-[52px] flex-1 font-mono text-base"
                  aria-label="Número do CRM"
                />
              </div>
            </div>

            {/* Email (actual backend field) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[0.8rem] font-semibold text-muted-foreground">
                ou use seu e-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
                autoComplete="email"
                disabled={loading}
                aria-invalid={!!fieldErrors.email}
                className="h-[52px]"
              />
              {fieldErrors.email && <p role="alert" className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[0.8rem] font-semibold">Senha</Label>
                <button type="button" onClick={() => setForgotOpen(true)}
                  className="text-[0.8rem] font-medium text-clinical-teal hover:underline">
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
                  className="h-[52px] pr-12"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeSlash className="size-[17px]" /> : <Eye className="size-[17px]" />}
                </button>
              </div>
              {fieldErrors.password && <p role="alert" className="text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            {/* Keep session toggle */}
            <button
              type="button"
              onClick={() => setKeepSession(!keepSession)}
              className="flex w-full items-center gap-3 rounded-[12px] border border-clinical-line bg-card px-4 py-3 text-left"
            >
              <DeviceMobileCamera className="size-[17px] shrink-0 text-clinical-teal" />
              <p className="flex-1 text-[0.8rem] text-muted-foreground">
                Manter sessão neste dispositivo do hospital por 12h de plantão.
              </p>
              <span
                className="flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5 transition-colors"
                style={{ background: keepSession ? 'var(--teal)' : 'var(--line)' }}
              >
                <span
                  className="h-[18px] w-[18px] rounded-full bg-white transition-transform"
                  style={{ transform: keepSession ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
            </button>

            <Button type="submit" className="h-14 w-full text-base font-semibold shadow-[0_4px_14px_rgba(14,124,123,0.3)]" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no plantão'}
            </Button>

            <p className="text-center text-[0.8rem] text-muted-foreground">
              Primeira vez aqui?{' '}
              <Link href="/register" className="font-semibold text-clinical-teal hover:underline">
                Criar conta com CRM
              </Link>
            </p>
          </form>

          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle variant="brand">Recuperar senha</DialogTitle>
                <DialogDescription>
                  O reset automático por email será ativado em breve. Por enquanto, entre em contato com o suporte para redefinir sua senha.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <a href="mailto:suporte@strivum.com.br?subject=Reset%20de%20senha%20Copiloto%20Cl%C3%ADnico"
                  className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3 transition-colors hover:bg-muted/40">
                  <EnvelopeSimple className="size-5 shrink-0 text-clinical-teal" weight="duotone" />
                  <div>
                    <p className="text-sm font-medium">suporte@strivum.com.br</p>
                    <p className="text-xs text-muted-foreground">Resposta em até 1 dia útil. Inclua seu CRM para verificação.</p>
                  </div>
                </a>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setForgotOpen(false)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
