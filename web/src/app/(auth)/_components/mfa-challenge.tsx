'use client';

/**
 * Segundo fator do login (código do app autenticador ou de recuperação).
 * Compartilhado pelo login por senha e pelo login com Google/Microsoft
 * (CC-334): os dois recebem um `mfaToken` e trocam pelo POST /auth/mfa/verify.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthResponse, Physician } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, DeviceMobile, WarningCircle } from '@phosphor-icons/react';
import { AuthHeading } from './auth-ui';

const EMPTY_CODE = ['', '', '', '', '', ''];

export function MfaChallenge({
  mfaToken,
  onSuccess,
  onBack,
  backLabel = 'Voltar ao login',
}: {
  mfaToken: string;
  onSuccess: (physician: Physician) => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const [mfaCode, setMfaCode] = useState(EMPTY_CODE);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const setDigitRef = useCallback(
    (idx: number) => (el: HTMLInputElement | null) => {
      digitRefs.current[idx] = el;
    },
    [],
  );

  useEffect(() => {
    digitRefs.current[0]?.focus();
  }, []);

  function handleDigitChange(idx: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...mfaCode];
      digits.forEach((d, i) => {
        if (idx + i < 6) newCode[idx + i] = d;
      });
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

  function handleDigitPaste(e: ClipboardEvent) {
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
      const data = await apiClient.post<AuthResponse>('/auth/mfa/verify', { mfaToken, code });
      onSuccess(data.physician);
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

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        icon={
          <DeviceMobile className="size-10 text-foreground" weight="duotone" aria-hidden="true" />
        }
        title="Verificação em duas etapas"
        description={
          useBackup
            ? 'Insira um dos códigos de recuperação que você salvou ao ativar a verificação.'
            : 'Abra seu app autenticador e insira o código de 6 dígitos.'
        }
      />
      <form onSubmit={handleMfaSubmit} noValidate className="flex flex-col gap-4">
        {!useBackup ? (
          <fieldset>
            <legend className="sr-only">Código de verificação de 6 dígitos</legend>
            {/* S22-A11Y-02 — OTP responsivo (cabe em iPhone SE 320px). */}
            <div className="flex justify-center gap-1.5 sm:gap-2">
              {mfaCode.map((digit, idx) => (
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
                  aria-invalid={!!mfaError}
                  className="size-11 p-0 text-center text-lg font-semibold tabular-nums select-none max-sm:size-11 sm:size-12 sm:text-xl"
                  aria-label={`Dígito ${idx + 1} de 6`}
                />
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="flex flex-col gap-1.5">
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
              aria-invalid={!!mfaError}
              className="font-mono"
            />
          </div>
        )}

        {mfaError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>{mfaError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Verificar
        </Button>

        <div className="flex flex-col items-center gap-1 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              setUseBackup(!useBackup);
              setMfaError('');
            }}
          >
            {useBackup ? 'Usar código do app autenticador' : 'Usar código de recuperação'}
          </Button>
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
