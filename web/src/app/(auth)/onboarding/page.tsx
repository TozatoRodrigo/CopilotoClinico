'use client';

import { useState, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Confetti,
  ShieldCheck,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  UserCircle,
  QrCode,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface MfaSetupResponse {
  otpauthUri: string;
  backupCodes: string[];
  qrCode: string;
}

type Step = 'welcome' | 'mfa-qr' | 'mfa-verify' | 'mfa-backup' | 'profile' | 'done';

const STEPS: Step[] = ['welcome', 'mfa-qr', 'mfa-verify', 'mfa-backup', 'profile', 'done'];
const STEP_LABELS: Record<Step, string> = {
  welcome: 'Boas-vindas',
  'mfa-qr': 'Autenticador',
  'mfa-verify': 'Verificar',
  'mfa-backup': 'Códigos',
  profile: 'Perfil',
  done: 'Pronto!',
};

export default function OnboardingPage() {
  const { physician } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);

  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [totpDigits, setTotpDigits] = useState(['', '', '', '', '', '']);
  const [totpError, setTotpError] = useState('');
  const [backupCopied, setBackupCopied] = useState(false);

  const [profileName, setProfileName] = useState(physician?.name ?? '');

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const setDigitRef = useCallback(
    (idx: number) => (el: HTMLInputElement | null) => {
      digitRefs.current[idx] = el;
    },
    [],
  );

  const stepIndex = STEPS.indexOf(step);
  const progressPercent = (stepIndex / (STEPS.length - 1)) * 100;

  function goTo(next: Step) {
    setStep(next);
    window.scrollTo(0, 0);
  }

  async function handleStartMfa() {
    setLoading(true);
    try {
      const data = await apiClient.post<MfaSetupResponse>('/auth/mfa/setup');
      setMfaSetup(data);
      goTo('mfa-qr');
    } catch (err) {
      if (err instanceof ApiError && err.message.includes('already enabled')) {
        goTo('profile');
      } else {
        toast.error('Erro ao configurar MFA. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(idx: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...totpDigits];
      digits.forEach((d, i) => {
        if (idx + i < 6) newCode[idx + i] = d;
      });
      setTotpDigits(newCode);
      const focusIdx = Math.min(idx + digits.length, 5);
      digitRefs.current[focusIdx]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '');
    const newCode = [...totpDigits];
    newCode[idx] = digit;
    setTotpDigits(newCode);
    setTotpError('');
    if (digit && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }
  }

  function handleDigitKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !totpDigits[idx] && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
      const newCode = [...totpDigits];
      newCode[idx - 1] = '';
      setTotpDigits(newCode);
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = pasted.split('');
    const newCode = [...totpDigits];
    digits.forEach((d, i) => {
      if (i < 6) newCode[i] = d;
    });
    setTotpDigits(newCode);
    digitRefs.current[Math.min(digits.length - 1, 5)]?.focus();
  }

  async function handleVerifyTotp(e: FormEvent) {
    e.preventDefault();
    const code = totpDigits.join('');
    if (code.length !== 6) {
      setTotpError('Insira os 6 dígitos.');
      return;
    }
    setLoading(true);
    setTotpError('');
    try {
      await apiClient.post('/auth/mfa/enable', { totpCode: code });
      goTo('mfa-backup');
    } catch {
      setTotpError('Código inválido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyBackup() {
    if (!mfaSetup) return;
    const text = mfaSetup.backupCodes.join('\n');
    await navigator.clipboard.writeText(text);
    setBackupCopied(true);
    setTimeout(() => setBackupCopied(false), 2000);
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      goTo('done');
    } finally {
      setLoading(false);
    }
  }

  function handleFinish() {
    router.push('/dashboard');
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{STEP_LABELS[step]}</span>
          <span className="text-xs text-muted-foreground">
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-clinical-line">
          <div
            className="h-full rounded-full bg-clinical-teal transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {step === 'welcome' && (
        <div className="space-y-6 pt-4">
          <div className="space-y-2 text-center">
            <h1 className="font-display text-3xl tracking-tight text-clinical-ink">
              Bem-vindo ao Copiloto Clínico
            </h1>
            <p className="text-muted-foreground">
              {physician?.name
                ? `Dr(a). ${physician.name}, vamos configurar sua conta.`
                : 'Vamos configurar sua conta em poucos passos.'}
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-clinical-line bg-clinical-paper p-5">
            <h2 className="text-sm font-semibold text-clinical-ink">O que vamos fazer:</h2>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-clinical-teal" />
                <span>
                  <strong className="text-clinical-ink">Autenticação de dois fatores</strong> —
                  obrigatória para médicos, conforme CFM
                </span>
              </li>
              <li className="flex items-start gap-2">
                <UserCircle className="mt-0.5 size-4 shrink-0 text-clinical-teal" />
                <span>
                  <strong className="text-clinical-ink">Completar perfil</strong> — nome e
                  especialidade
                </span>
              </li>
            </ol>
          </div>

          <Button onClick={handleStartMfa} className="h-11 w-full" disabled={loading}>
            Começar
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      )}

      {step === 'mfa-qr' && mfaSetup && (
        <div className="space-y-6 pt-4">
          <div className="space-y-1 text-center">
            <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
              Configure seu autenticador
            </h1>
            <p className="text-sm text-muted-foreground">
              Escaneie o QR code com Google Authenticator, Authy ou similar.
            </p>
          </div>

          <div className="flex justify-center">
            <div className="rounded-xl border border-clinical-line bg-white p-3">
              <Image
                src={mfaSetup.qrCode}
                alt="QR Code para autenticador"
                width={200}
                height={200}
                unoptimized
              />
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Não consegue escanear?{' '}
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(mfaSetup.otpauthUri);
                toast.success('Link copiado!');
              }}
              className="text-clinical-teal underline underline-offset-2"
            >
              Copie o link manual
            </button>
          </p>

          <Button
            onClick={() => {
              goTo('mfa-verify');
              setTimeout(() => digitRefs.current[0]?.focus(), 100);
            }}
            className="h-11 w-full"
          >
            Já escaneei
            <ArrowRight className="ml-1 size-4" />
          </Button>

          <button
            type="button"
            onClick={() => goTo('welcome')}
            className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-clinical-ink"
          >
            <ArrowLeft className="size-3" />
            Voltar
          </button>
        </div>
      )}

      {step === 'mfa-verify' && (
        <div className="space-y-6 pt-4">
          <div className="space-y-1 text-center">
            <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
              Verifique o código
            </h1>
            <p className="text-sm text-muted-foreground">
              Insira o código de 6 dígitos do seu app autenticador.
            </p>
          </div>

          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <div className="flex justify-center gap-2">
              {totpDigits.map((digit, idx) => (
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
                  className="size-12 select-none p-0 text-center text-xl font-semibold tabular-nums"
                  aria-label={`Dígito ${idx + 1} de 6`}
                />
              ))}
            </div>

            {totpError && <p className="text-center text-sm text-destructive">{totpError}</p>}

            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? 'Verificando...' : 'Verificar e ativar'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => goTo('mfa-qr')}
            className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-clinical-ink"
          >
            <ArrowLeft className="size-3" />
            Voltar ao QR code
          </button>
        </div>
      )}

      {step === 'mfa-backup' && mfaSetup && (
        <div className="space-y-6 pt-4">
          <div className="space-y-1 text-center">
            <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
              Guarde seus códigos de recuperação
            </h1>
            <p className="text-sm text-muted-foreground">
              Use esses códigos se perder acesso ao autenticador. Guarde-os em local seguro.
            </p>
          </div>

          <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {mfaSetup.backupCodes.map((code, idx) => (
                <div
                  key={idx}
                  className="rounded-md bg-white px-3 py-2 text-center tabular-nums text-clinical-ink"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>

          <Button variant="outline" className="h-11 w-full gap-2" onClick={handleCopyBackup}>
            {backupCopied ? (
              <>
                <Check className="size-4 text-clinical-green" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copiar todos
              </>
            )}
          </Button>

          <Button onClick={() => goTo('profile')} className="h-11 w-full">
            Já salvei os códigos
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      )}

      {step === 'profile' && (
        <div className="space-y-6 pt-4">
          <div className="space-y-1 text-center">
            <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
              Complete seu perfil
            </h1>
            <p className="text-sm text-muted-foreground">
              Essas informações aparecem nos documentos gerados.
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profileName">Nome completo</Label>
              <Input
                id="profileName"
                type="text"
                placeholder="Dr. João Silva"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                disabled={loading}
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label>CRM</Label>
              <div className="flex items-center gap-2 rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2.5 text-sm">
                <QrCode className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {physician?.crmUf} {physician?.crmNumber}
                </span>
                {physician?.crmVerified ? (
                  <span className="ml-auto text-xs font-medium text-clinical-green">
                    Verificado
                  </span>
                ) : (
                  <span className="ml-auto text-xs font-medium text-clinical-amber">Pendente</span>
                )}
              </div>
            </div>

            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? 'Salvando...' : 'Continuar'}
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </form>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-6 pt-8 text-center">
          <div className="flex justify-center">
            <Confetti className="size-16 text-clinical-teal" weight="duotone" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl tracking-tight text-clinical-ink">Tudo pronto!</h1>
            <p className="text-muted-foreground">
              Sua conta está configurada. Vamos começar a usar o Copiloto Clínico.
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-clinical-green/30 bg-clinical-green-bg p-4 text-left text-sm text-clinical-green-foreground">
            <p className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-clinical-green" />
              MFA ativado com sucesso
            </p>
            <p className="flex items-center gap-2">
              <UserCircle className="size-4 text-clinical-green" />
              Perfil configurado
            </p>
          </div>

          <Button onClick={handleFinish} className="h-11 w-full">
            Ir para o dashboard
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
