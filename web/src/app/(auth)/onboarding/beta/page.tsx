'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  FileText,
  Flask,
  Hospital,
  IdentificationCard,
  WarningCircle,
} from '@phosphor-icons/react';
import { BETA_TERMS } from '@contracts/beta';
import { useAuth } from '@/lib/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAcceptBetaTerms, useBetaMe, useSaveBetaProfile } from '@/lib/beta-queries';
import { getDemoCasePreset } from '@/lib/demo-case-presets';
import type { CreateEncounterRequest, CreateEncounterResponse } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';
import { AuthHeading, FieldError } from '../../_components/auth-ui';
import {
  BetaProfileFields,
  validateBetaProfile,
  type BetaProfileDraft,
  type BetaProfileErrors,
} from '../../_components/beta-profile-fields';
import { BetaTermsText } from './_components/beta-terms';

/**
 * CC-702 — onboarding de quem entrou no beta por convite: termo do beta,
 * perfil do plantão (o CRM já veio no cadastro) e o primeiro caso guiado.
 * Feito para caber em 2 minutos; sem o 2º fator, que o médico liga depois em
 * Configurações → Segurança.
 */

type Step = 'terms' | 'profile' | 'first-case';

const STEPS: Step[] = ['terms', 'profile', 'first-case'];
const STEP_LABELS: Record<Step, string> = {
  terms: 'Termo do beta',
  profile: 'Seu plantão',
  'first-case': 'Primeiro caso',
};

/**
 * Caso fictício do primeiro uso: falta um dado que muda a conduta (uso de
 * imunossupressor), então o copiloto guiado (ADR-014) pergunta antes do plano.
 */
const FIRST_CASE_SLUG = 'sindrome-gripal';

export default function BetaOnboardingPage() {
  const router = useRouter();
  const me = useBetaMe();
  const [step, setStep] = useState<Step | null>(null);

  const data = me.data;
  const current: Step =
    step ??
    (data?.participant
      ? !data.terms.upToDate
        ? 'terms'
        : data.profile
          ? 'first-case'
          : 'profile'
      : 'terms');

  // Conta sem convite não tem onboarding do beta.
  useEffect(() => {
    if (data && !data.participant) router.replace('/dashboard');
  }, [data, router]);

  if (me.isPending || (data && !data.participant)) {
    return (
      <div className="flex justify-center pt-16" role="status" aria-label="Carregando">
        <LogoMark size="lg" className="animate-pulse" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="flex w-full max-w-[480px] flex-col gap-4">
        <Alert variant="destructive">
          <WarningCircle aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Não foi possível carregar o seu acesso ao beta.</span>
            <Button variant="outline" size="sm" onClick={() => void me.refetch()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  function goTo(next: Step) {
    setStep(next);
    window.scrollTo(0, 0);
  }

  return (
    <div className="flex w-full max-w-[520px] flex-col gap-10">
      <StepProgress current={STEPS.indexOf(current)} />
      {current === 'terms' && (
        <TermsStep onAccepted={(profileDone) => goTo(profileDone ? 'first-case' : 'profile')} />
      )}
      {current === 'profile' && <ProfileStep onSaved={() => goTo('first-case')} />}
      {current === 'first-case' && <FirstCaseStep />}
    </div>
  );
}

function TermsStep({ onAccepted }: { onAccepted: (profileDone: boolean) => void }) {
  const accept = useAcceptBetaTerms();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError('Para participar do beta, aceite o termo.');
      return;
    }
    accept.mutate(
      { version: BETA_TERMS.version },
      {
        onSuccess: (me) => onAccepted(me.participant && me.profile !== null),
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Não foi possível registrar o aceite.'),
      },
    );
  }

  return (
    <StepBody>
      <AuthHeading
        icon={<StepIcon icon={FileText} />}
        title="Bem-vindo ao beta"
        description="Antes do primeiro caso, leia o termo de participação. Leva um minuto."
      />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <BetaTermsText />
        <div className="flex flex-col gap-1.5">
          <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                setError('');
              }}
              disabled={accept.isPending}
              aria-invalid={!!error}
              aria-describedby={error ? 'terms-error' : undefined}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
            />
            <span className="text-[0.8125rem] text-muted-foreground">
              Li e aceito o {BETA_TERMS.title.toLowerCase()}.
            </span>
          </label>
          {error && <FieldError id="terms-error">{error}</FieldError>}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={accept.isPending}>
          Aceitar e continuar
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
    </StepBody>
  );
}

function ProfileStep({ onSaved }: { onSaved: () => void }) {
  const { physician } = useAuth();
  const save = useSaveBetaProfile();
  const [draft, setDraft] = useState<BetaProfileDraft>({});
  const [errors, setErrors] = useState<BetaProfileErrors>({});
  const [formError, setFormError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const result = validateBetaProfile(draft);
    if (!result.profile) {
      setErrors(result.errors);
      return;
    }
    save.mutate(result.profile, {
      onSuccess: onSaved,
      onError: (err) =>
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.'),
    });
  }

  return (
    <StepBody>
      <AuthHeading
        icon={<StepIcon icon={Hospital} />}
        title="Seu plantão"
        description="Para avaliarmos o beta com quem está na ponta. São quatro escolhas."
      />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {physician && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">CRM</p>
            <div className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <IdentificationCard
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-foreground tabular-nums">
                {physician.crmUf} {physician.crmNumber}
              </span>
              {physician.crmVerified ? (
                <Badge variant="success" className="ml-auto">
                  Verificado
                </Badge>
              ) : (
                <Badge variant="warning" className="ml-auto">
                  Em verificação
                </Badge>
              )}
            </div>
          </div>
        )}

        <BetaProfileFields
          idPrefix="beta-profile"
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setErrors({});
          }}
          errors={errors}
          disabled={save.isPending}
        />

        {formError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full" loading={save.isPending}>
          Salvar e continuar
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
    </StepBody>
  );
}

function FirstCaseStep() {
  const router = useRouter();
  const preset = getDemoCasePreset(FIRST_CASE_SLUG);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  async function openExampleCase() {
    if (!preset) {
      router.push('/encounters/new');
      return;
    }
    setOpening(true);
    setError('');
    try {
      const body: CreateEncounterRequest = {
        patientRef: preset.patientRef,
        vertical: preset.vertical as CreateEncounterRequest['vertical'],
        context: preset.context,
      };
      const created = await apiClient.post<CreateEncounterResponse>('/encounters', body);
      router.push(`/encounters/${created.id}/conversation?demoCase=${preset.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o caso de exemplo.');
      setOpening(false);
    }
  }

  return (
    <StepBody>
      <AuthHeading
        icon={<StepIcon icon={Flask} />}
        title="Seu primeiro caso"
        description="Um caso fictício para conhecer o copiloto guiado: você manda o relato, ele pergunta só o que muda a conduta e monta o plano."
      />
      {preset && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{preset.title}</p>
            <Badge variant="purple">Caso de exemplo</Badge>
          </div>
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">{preset.summary}</p>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <WarningCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Button
          size="lg"
          className="w-full"
          loading={opening}
          onClick={() => void openExampleCase()}
        >
          Abrir o caso de exemplo
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => router.push('/dashboard')}
        >
          Ir para o Plantão
        </Button>
      </div>
      <p className="text-center text-[0.8125rem] text-pretty text-muted-foreground">
        Para proteger a conta, ative a verificação em duas etapas em Configurações → Segurança.
      </p>
    </StepBody>
  );
}

function StepProgress({ current }: { current: number }) {
  const safe = Math.max(0, current);
  return (
    <div className="flex flex-col items-center gap-2">
      <ol aria-label="Etapas do onboarding do beta" className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === safe ? 'step' : undefined}>
            <span className="sr-only">
              {STEP_LABELS[s]}
              {i < safe ? ' (concluída)' : ''}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'block h-1.5 rounded-full transition-[width,background-color] duration-200',
                i === safe
                  ? 'w-5 bg-foreground'
                  : i < safe
                    ? 'w-1.5 bg-muted-foreground'
                    : 'w-1.5 bg-tone-gray-tag',
              )}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground" aria-hidden="true">
        {safe + 1} de {STEPS.length} · {STEP_LABELS[STEPS[safe] ?? 'terms']}
      </p>
    </div>
  );
}

function StepBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-8">{children}</div>;
}

function StepIcon({ icon: Icon }: { icon: React.ElementType }) {
  return <Icon className="size-10 text-foreground" weight="duotone" aria-hidden="true" />;
}
