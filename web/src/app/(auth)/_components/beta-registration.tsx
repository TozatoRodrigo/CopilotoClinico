'use client';

/**
 * CC-702 — o beta por convite na tela de cadastro.
 *
 * - Link de convite (`/register?convite=K3MQ-9XPT`): o código já vem
 *   preenchido e conferido antes do envio.
 * - `BETA_INVITE_REQUIRED` ligada e sem código: a tela abre na lista de
 *   espera, com "Tenho um código de convite" para voltar ao formulário.
 * - Flag desligada e sem código: o cadastro fica exatamente como antes.
 *
 * O mesmo par (campo do convite + recusa da API) serve ao cadastro que vem
 * do login com Google/Microsoft (CC-334): o código vai junto do CRM no
 * `POST /auth/oauth/signup`.
 */
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import {
  BETA_INVITE_INVALID,
  BETA_INVITE_PROBLEM_MESSAGES,
  BETA_INVITE_QUERY_PARAM,
  BETA_INVITE_REQUIRED,
  formatInviteCode,
  normalizeInviteCode,
} from '@contracts/beta';
import { ApiError } from '@/lib/api-client';
import { useBetaRegistrationStatus, useJoinBetaWaitlist } from '@/lib/beta-queries';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthHeading, FieldError, subtleLinkClass } from './auth-ui';
import { BetaProfileFields, type BetaProfileDraft } from './beta-profile-fields';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BetaRegistrationView = 'form' | 'waitlist';

export function useBetaRegistration() {
  const searchParams = useSearchParams();
  const codeFromLink = normalizeInviteCode(searchParams.get(BETA_INVITE_QUERY_PARAM) ?? '');
  const status = useBetaRegistrationStatus(codeFromLink);

  const [inviteCode, setInviteCodeState] = useState(() => formatInviteCode(codeFromLink));
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [view, setView] = useState<BetaRegistrationView | null>(null);
  const [linkErrorDismissed, setLinkErrorDismissed] = useState(false);

  const inviteRequired = status.data?.inviteRequired ?? false;
  const linkInvite = status.data?.invite;
  const linkProblem =
    linkInvite && !linkInvite.valid && !linkErrorDismissed
      ? BETA_INVITE_PROBLEM_MESSAGES[linkInvite.reason]
      : null;

  return {
    /** Ainda descobrindo se o cadastro exige convite. */
    loading: status.isPending,
    inviteRequired,
    /** Beta fechado sem código: a lista de espera vem primeiro. */
    view: view ?? (inviteRequired && !codeFromLink ? 'waitlist' : 'form'),
    showWaitlist: () => setView('waitlist'),
    showForm: () => setView('form'),
    /** O campo só aparece no beta fechado ou quando o link trouxe código. */
    showInviteField: inviteRequired || codeFromLink !== '',
    inviteCode,
    setInviteCode: (next: string) => {
      setInviteCodeState(next);
      setInviteError(null);
      setLinkErrorDismissed(true);
    },
    inviteError: inviteError ?? linkProblem,
    inviteValidFromLink:
      linkInvite?.valid === true && inviteCode === formatInviteCode(codeFromLink),
    /** O código a mandar no cadastro (`undefined` sem código). */
    inviteCodeForRequest: normalizeInviteCode(inviteCode) || undefined,
    /** Antes do envio: no beta fechado o código é obrigatório. */
    validateInvite(): boolean {
      if (inviteRequired && !normalizeInviteCode(inviteCode)) {
        setInviteError('Informe o código de convite.');
        return false;
      }
      return true;
    },
    /** Recusa do convite vinda da API; `true` se o erro era dele. */
    handleRegisterError(err: unknown): boolean {
      if (!(err instanceof ApiError)) return false;
      if (err.code === BETA_INVITE_REQUIRED) {
        setView('waitlist');
        return true;
      }
      if (err.code === BETA_INVITE_INVALID) {
        setInviteError(err.message);
        return true;
      }
      return false;
    },
  };
}

export function BetaInviteField({
  value,
  onChange,
  error,
  validFromLink,
  required,
  disabled,
  onJoinWaitlist,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  validFromLink: boolean;
  required: boolean;
  disabled: boolean;
  onJoinWaitlist?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="inviteCode">Código de convite{required ? '' : ' (opcional)'}</Label>
      <Input
        id="inviteCode"
        type="text"
        placeholder="XXXX-XXXX"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? 'invite-error' : 'invite-hint'}
        className="h-10 font-mono tracking-wider uppercase"
      />
      {error ? (
        <FieldError id="invite-error">{error}</FieldError>
      ) : validFromLink ? (
        <p id="invite-hint" className="flex items-center gap-1 text-xs text-tone-green-ink">
          <CheckCircle className="size-3.5" weight="fill" aria-hidden="true" />
          Convite válido.
        </p>
      ) : (
        <p id="invite-hint" className="text-xs text-muted-foreground">
          O beta é fechado: o código veio no convite que você recebeu.
        </p>
      )}
      {onJoinWaitlist && (
        <p className="text-[0.8125rem] text-muted-foreground">
          Sem convite?{' '}
          <button type="button" onClick={onJoinWaitlist} className={subtleLinkClass}>
            Entre na lista de espera
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Lista de espera do beta: e-mail, consentimento explícito para contato e,
 * se a pessoa quiser, o perfil mínimo. A resposta é sempre a mesma — a tela
 * não diz se o e-mail já estava na lista ou já tem conta.
 */
export function BetaWaitlistPanel({ onHaveInvite }: { onHaveInvite: () => void }) {
  const join = useJoinBetaWaitlist();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [profile, setProfile] = useState<BetaProfileDraft>({});
  const [errors, setErrors] = useState<{ email?: string; consent?: string }>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'E-mail é obrigatório.';
    else if (!EMAIL_REGEX.test(email.trim())) next.email = 'Formato de e-mail inválido.';
    if (!consent) next.consent = 'Sem o seu consentimento não podemos avisar você.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    join.mutate({
      email: email.trim(),
      contactConsent: true,
      profile: Object.keys(profile).length > 0 ? profile : undefined,
    });
  }

  if (join.isSuccess) {
    return (
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <AuthHeading
          title="Você está na lista de espera"
          description="Quando abrir uma vaga, a equipe manda o seu convite para o e-mail informado."
        />
        <Callout tone="green" icon={<CheckCircle weight="fill" />}>
          Para sair da lista e apagar o seu e-mail, escreva para o Encarregado de Dados (contato na{' '}
          <Link href="/privacidade" className={subtleLinkClass}>
            Política de Privacidade
          </Link>
          ).
        </Callout>
        <p className="text-center text-sm text-muted-foreground">
          Já recebeu o convite?{' '}
          <button type="button" onClick={onHaveInvite} className={subtleLinkClass}>
            Usar código de convite
          </button>
        </p>
      </div>
    );
  }

  const loading = join.isPending;

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-8">
      <AuthHeading
        title="Beta só para convidados"
        description="O Copiloto Clínico está em teste com um grupo fechado de médicos. Entre na lista de espera e avisamos quando abrir uma vaga."
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="waitlist-email">E-mail</Label>
          <Input
            id="waitlist-email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoComplete="email"
            disabled={loading}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'waitlist-email-error' : undefined}
            className="h-10"
          />
          {errors.email && <FieldError id="waitlist-email-error">{errors.email}</FieldError>}
        </div>

        <Disclosure title="Conte sobre o seu plantão" meta="opcional">
          <div className="pt-3">
            <BetaProfileFields
              idPrefix="waitlist"
              value={profile}
              onChange={setProfile}
              disabled={loading}
            />
          </div>
        </Disclosure>

        <div className="flex flex-col gap-1.5">
          <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              disabled={loading}
              aria-invalid={!!errors.consent}
              aria-describedby={errors.consent ? 'waitlist-consent-error' : undefined}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
            />
            <span className="text-[0.8125rem] text-muted-foreground">
              Autorizo a equipe do Copiloto Clínico a me escrever neste e-mail sobre o beta.
              Guardamos só o e-mail e o que você contar acima, e apagamos quando você pedir (
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className={subtleLinkClass}
              >
                Política de Privacidade
              </Link>
              ).
            </span>
          </label>
          {errors.consent && <FieldError id="waitlist-consent-error">{errors.consent}</FieldError>}
        </div>

        {join.isError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>
              {join.error instanceof ApiError
                ? join.error.message
                : 'Não foi possível entrar na lista agora. Tente de novo.'}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="mt-1 w-full" loading={loading}>
          Entrar na lista de espera
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
        <p>
          Recebeu um convite?{' '}
          <button type="button" onClick={onHaveInvite} className={subtleLinkClass}>
            Tenho um código de convite
          </button>
        </p>
        <p>
          Já tem conta?{' '}
          <Link href="/login" className={subtleLinkClass}>
            Faça login
          </Link>
        </p>
      </div>
    </div>
  );
}
