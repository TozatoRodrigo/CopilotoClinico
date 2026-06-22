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
  Download,
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

/**
 * S24-MFA-01 — chave para persistir backup codes no sessionStorage.
 *
 * Antes deste change, os códigos ficavam apenas em useState local. Se o médico
 * desse refresh no passo 'mfa-backup', perdia tudo — e o MFA já estava habilitado
 * (enableMfa foi chamado no passo anterior). Resultado: LOCKOUT permanente,
 * sem recuperação a não ser admin reset.
 *
 * Agora persistimos em sessionStorage até o médico confirmar que salvou. Em
 * sprint futura, ao chamar /auth/mfa/regenerate-backup-codes (S24-MFA-03),
 * essa chave é sobrescrita com os novos códigos.
 */
const BACKUP_CODES_KEY = 'copiloto:onboarding:backup-codes';

/**
 * S24-ONBOARD-01 — lista de especialidades para o step de perfil.
 * Permite segmentação clínica (qual diretriz priorizar, analytics por área).
 */
const SPECIALTIES = [
  'Emergência',
  'Clínica Médica',
  'Cardiologia',
  'Pneumologia',
  'Pediatria',
  'Neurologia',
  'Cirurgia Geral',
  'Ortopedia',
  'Ginecologia/Obstetrícia',
  'Psiquiatria',
  'Anestesiologia',
  'Outra',
] as const;

export default function OnboardingPage() {
  const { physician, updatePhysician } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);

  // S24-MFA-01 — restaura backup codes do sessionStorage se o médico deu
  // refresh no passo 'mfa-backup'. Antes era só useState local → LOCKOUT.
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem(BACKUP_CODES_KEY);
    if (!raw) return null;
    try {
      const codes = JSON.parse(raw) as string[];
      // Reconstroi o shape MfaSetupResponse sem otpauthUri/qrCode (já passou).
      return { otpauthUri: '', qrCode: '', backupCodes: codes };
    } catch {
      return null;
    }
  });
  const [totpDigits, setTotpDigits] = useState(['', '', '', '', '', '']);
  const [totpError, setTotpError] = useState('');
  const [backupCopied, setBackupCopied] = useState(false);

  const [profileName, setProfileName] = useState(physician?.name ?? '');
  const [profileSpecialty, setProfileSpecialty] = useState<string>('');

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
      // S24-MFA-01 — persiste backup codes imediatamente. Se o médico der
      // refresh em qualquer passo seguinte, ainda temos os códigos.
      try {
        sessionStorage.setItem(BACKUP_CODES_KEY, JSON.stringify(data.backupCodes));
      } catch {
        // quota / private mode — silently ignore; UI ainda mostra os códigos.
      }
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

  /**
   * S24-MFA-02 — baixa os códigos como arquivo .txt. Clipboard falha em
   * mobile iOS (permissões); arquivo é universal.
   */
  function handleDownloadBackup() {
    if (!mfaSetup) return;
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      'Copiloto Clínico — Códigos de recuperação MFA',
      `Gerados em: ${new Date().toLocaleString('pt-BR')}`,
      `Médico: ${physician?.email ?? ''}`,
      '',
      'Guarde este arquivo em local seguro. Cada código pode ser usado',
      'uma única vez para acessar sua conta se perder o app autenticador.',
      '',
      ...mfaSetup.backupCodes.map((c, i) => `${i + 1}. ${c}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copiloto-codigos-recuperacao-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Arquivo baixado. Guarde em local seguro.');
  }

  /**
   * S24-MFA-01 — chamado quando o médico confirma que salvou os códigos.
   * Limpa o sessionStorage (não queremos códigos MFA persistindo indefinidamente
   * em browser; se médico quiser ver de novo, deve regenerar via settings).
   */
  function handleBackupConfirmed() {
    try {
      sessionStorage.removeItem(BACKUP_CODES_KEY);
    } catch {
      // noop
    }
    goTo('profile');
  }

  /**
   * S24-ONBOARD-01 — persiste nome + especialidade via PATCH /auth/me.
   * Antes era só `goTo('done')` — o botão "Continuar" mentia (não salvava).
   */
  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (profileName.trim() && profileName !== physician?.name) {
        payload.name = profileName.trim();
      }
      if (profileSpecialty) {
        payload.specialty = profileSpecialty;
      }
      if (Object.keys(payload).length > 0) {
        await apiClient.patch('/auth/me', payload);
        updatePhysician(payload);
      }
      goTo('done');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar perfil.');
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
            className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-clinical-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
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
            <fieldset>
              <legend className="sr-only">Código de verificação TOTP de 6 dígitos</legend>
              {/* S22-A11Y-02 — OTP responsivo (cabe em iPhone SE 320px). */}
              <div className="flex justify-center gap-1.5 sm:gap-2">
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
                    className="size-10 select-none p-0 text-center text-lg font-semibold tabular-nums sm:size-12 sm:text-xl"
                    aria-label={`Dígito ${idx + 1} de 6`}
                  />
                ))}
              </div>
            </fieldset>

            {totpError && (
              <p role="alert" className="text-center text-sm text-destructive">
                {totpError}
              </p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? 'Verificando...' : 'Verificar e ativar'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => goTo('mfa-qr')}
            className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-clinical-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
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

          {/* S24-MFA-02 — duas opções: copiar (clipboard, falha em mobile iOS)
              e baixar .txt (universal). Médico escolhe conforme preferir. */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 gap-2"
              onClick={handleCopyBackup}
            >
              {backupCopied ? (
                <>
                  <Check className="size-4 text-clinical-green" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copiar
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 gap-2"
              onClick={handleDownloadBackup}
            >
              <Download className="size-4" />
              Baixar .txt
            </Button>
          </div>

          <Button onClick={handleBackupConfirmed} className="h-11 w-full">
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

            {/*
              S24-ONBOARD-01 — captura especialidade (antes era prometida no
              copy mas nunca coletada). Usada para segmentação clínica (qual
              diretriz priorizar, analytics por área).
            */}
            <div className="space-y-2">
              <Label htmlFor="profileSpecialty">Especialidade</Label>
              <select
                id="profileSpecialty"
                value={profileSpecialty}
                onChange={(e) => setProfileSpecialty(e.target.value)}
                disabled={loading}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Selecione…</option>
                {SPECIALTIES.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
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
