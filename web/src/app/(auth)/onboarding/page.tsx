'use client';

import {
  useState,
  useRef,
  useCallback,
  type FormEvent,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
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
  DeviceMobile,
  IdentificationCard,
  Key,
  WarningCircle,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { AuthHeading } from '../_components/auth-ui';
import { OptionCard } from '../_components/option-card';

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
    <div className="flex w-full max-w-[480px] flex-col gap-10">
      <StepProgress current={stepIndex} />

      {step === 'welcome' && (
        <StepBody>
          <AuthHeading
            title="Bem-vindo ao Copiloto Clínico"
            description={
              physician?.name
                ? `Dr(a). ${physician.name}, vamos configurar sua conta.`
                : 'Vamos configurar sua conta em poucos passos.'
            }
          />

          <div className="flex flex-col gap-2">
            <h2 className="text-[0.8125rem] font-medium text-muted-foreground">O que vamos fazer:</h2>
            <ol className="divide-y divide-border rounded-lg border border-border">
              <li className="flex items-start gap-3 px-4 py-3.5">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">
                  <strong className="block font-semibold text-foreground">Autenticação de dois fatores</strong>
                  Obrigatória para médicos, conforme CFM.
                </span>
              </li>
              <li className="flex items-start gap-3 px-4 py-3.5">
                <UserCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">
                  <strong className="block font-semibold text-foreground">Completar perfil</strong>
                  Nome e especialidade.
                </span>
              </li>
            </ol>
          </div>

          <StepActions>
            <Button onClick={handleStartMfa} size="lg" className="w-full" loading={loading}>
              Começar
              <ArrowRight aria-hidden="true" />
            </Button>
          </StepActions>
        </StepBody>
      )}

      {step === 'mfa-qr' && mfaSetup && (
        <StepBody>
          <AuthHeading
            icon={<StepIcon icon={QrCode} />}
            title="Configure seu autenticador"
            description="Escaneie o QR code com Google Authenticator, Authy ou similar."
          />

          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <Image
                src={mfaSetup.qrCode}
                alt="QR Code para autenticador"
                width={200}
                height={200}
                unoptimized
              />
            </div>
            <p className="text-center text-[0.8125rem] text-muted-foreground">
              Não consegue escanear?{' '}
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(mfaSetup.otpauthUri);
                  toast.success('Link copiado!');
                }}
                className="rounded-sm text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                Copie o link manual
              </button>
            </p>
          </div>

          <StepActions>
            <Button
              onClick={() => {
                goTo('mfa-verify');
                setTimeout(() => digitRefs.current[0]?.focus(), 100);
              }}
              size="lg"
              className="w-full"
            >
              Já escaneei
              <ArrowRight aria-hidden="true" />
            </Button>
            <BackButton onClick={() => goTo('welcome')}>Voltar</BackButton>
          </StepActions>
        </StepBody>
      )}

      {step === 'mfa-verify' && (
        <StepBody>
          <AuthHeading
            icon={<StepIcon icon={DeviceMobile} />}
            title="Verifique o código"
            description="Insira o código de 6 dígitos do seu app autenticador."
          />

          <form onSubmit={handleVerifyTotp} noValidate className="flex flex-col gap-4">
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
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    onPaste={handleDigitPaste}
                    disabled={loading}
                    aria-invalid={!!totpError}
                    className="size-11 p-0 text-center text-lg font-semibold tabular-nums select-none max-sm:size-11 sm:size-12 sm:text-xl"
                    aria-label={`Dígito ${idx + 1} de 6`}
                  />
                ))}
              </div>
            </fieldset>

            {totpError && (
              <Alert variant="destructive">
                <WarningCircle aria-hidden="true" />
                <AlertDescription>{totpError}</AlertDescription>
              </Alert>
            )}

            <StepActions>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Verificar e ativar
              </Button>
              <BackButton onClick={() => goTo('mfa-qr')}>Voltar ao QR code</BackButton>
            </StepActions>
          </form>
        </StepBody>
      )}

      {step === 'mfa-backup' && mfaSetup && (
        <StepBody>
          <AuthHeading
            icon={<StepIcon icon={Key} />}
            title="Guarde seus códigos de recuperação"
            description="Use esses códigos se perder acesso ao autenticador. Guarde-os em local seguro."
          />

          <div className="flex flex-col gap-2">
            <ul
              aria-label="Códigos de recuperação"
              className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-lg bg-tone-gray-bg px-5 py-4 font-mono text-sm text-foreground"
            >
              {mfaSetup.backupCodes.map((code, idx) => (
                <li key={idx} className="flex items-baseline gap-2 tabular-nums">
                  <span aria-hidden="true" className="w-4 text-right font-sans text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  {code}
                </li>
              ))}
            </ul>

            {/* S24-MFA-02 — duas opções: copiar (clipboard, falha em mobile iOS)
                e baixar .txt (universal). Médico escolhe conforme preferir. */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleCopyBackup}>
                {backupCopied ? (
                  <>
                    <Check className="text-clinical-green" weight="bold" aria-hidden="true" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" />
                    Copiar
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleDownloadBackup}>
                <Download aria-hidden="true" />
                Baixar .txt
              </Button>
            </div>
          </div>

          <p className="text-center text-[0.8125rem] text-pretty text-muted-foreground">
            Cada código funciona uma única vez. Sem eles, perder o celular pode bloquear seu acesso à conta.
          </p>

          <StepActions>
            <Button onClick={handleBackupConfirmed} size="lg" className="w-full">
              Já salvei os códigos
              <ArrowRight aria-hidden="true" />
            </Button>
          </StepActions>
        </StepBody>
      )}

      {step === 'profile' && (
        <StepBody>
          <AuthHeading
            icon={<StepIcon icon={UserCircle} />}
            title="Complete seu perfil"
            description="Essas informações aparecem nos documentos gerados."
          />

          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profileName">Nome completo</Label>
              <Input
                id="profileName"
                type="text"
                placeholder="Dr. João Silva"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                disabled={loading}
                autoComplete="name"
                className="h-10"
              />
            </div>

            {/*
              S24-ONBOARD-01 — captura especialidade (antes era prometida no
              copy mas nunca coletada). Usada para segmentação clínica (qual
              diretriz priorizar, analytics por área). Cartões de opção em vez
              de <select>: uma escolha visível de uma vez, como no Notion.
            */}
            <fieldset id="profileSpecialty" disabled={loading} className="flex flex-col gap-2">
              <legend className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
                Especialidade
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SPECIALTIES.map((spec) => (
                  <OptionCard
                    key={spec}
                    name="specialty"
                    value={spec}
                    checked={profileSpecialty === spec}
                    onSelect={setProfileSpecialty}
                  >
                    {/* Espaço de largura zero após "/" para quebrar "Ginecologia/Obstetrícia". */}
                    {spec.replace('/', '/\u200B')}
                  </OptionCard>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <p className="text-[0.8125rem] font-medium text-muted-foreground">CRM</p>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
                <IdentificationCard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-foreground tabular-nums">
                  {physician?.crmUf} {physician?.crmNumber}
                </span>
                {physician?.crmVerified ? (
                  <Badge variant="success" className="ml-auto">Verificado</Badge>
                ) : (
                  <Badge variant="warning" className="ml-auto">Pendente</Badge>
                )}
              </div>
            </div>

            <StepActions>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Continuar
                <ArrowRight aria-hidden="true" />
              </Button>
            </StepActions>
          </form>
        </StepBody>
      )}

      {step === 'done' && (
        <StepBody>
          <AuthHeading
            icon={<StepIcon icon={Confetti} />}
            title="Tudo pronto!"
            description="Sua conta está configurada. Vamos começar a usar o Copiloto Clínico."
          />

          <Callout tone="green">
            <ul className="flex flex-col gap-1">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-clinical-green" aria-hidden="true" />
                MFA ativado com sucesso
              </li>
              <li className="flex items-center gap-2">
                <UserCircle className="size-4 text-clinical-green" aria-hidden="true" />
                Perfil configurado
              </li>
            </ul>
          </Callout>

          <StepActions>
            <Button onClick={handleFinish} size="lg" className="w-full">
              Ir para o Plantão
              <ArrowRight aria-hidden="true" />
            </Button>
          </StepActions>
        </StepBody>
      )}
    </div>
  );
}

/** Progresso do onboarding em pontos (etapa atual alongada), como no Notion. */
function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ol aria-label="Etapas da configuração" className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === current ? 'step' : undefined}>
            <span className="sr-only">
              {STEP_LABELS[s]}
              {i < current ? ' (concluída)' : ''}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'block h-1.5 rounded-full transition-[width,background-color] duration-200',
                i === current
                  ? 'w-5 bg-foreground'
                  : i < current
                    ? 'w-1.5 bg-muted-foreground'
                    : 'w-1.5 bg-tone-gray-tag',
              )}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground" aria-hidden="true">
        {current + 1} de {STEPS.length} · {STEP_LABELS[STEPS[current]]}
      </p>
    </div>
  );
}

function StepBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-8">{children}</div>;
}

function StepActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

function StepIcon({ icon: Icon }: { icon: ElementType }) {
  return <Icon className="size-10 text-foreground" weight="duotone" aria-hidden="true" />;
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={onClick}>
      <ArrowLeft aria-hidden="true" />
      {children}
    </Button>
  );
}
