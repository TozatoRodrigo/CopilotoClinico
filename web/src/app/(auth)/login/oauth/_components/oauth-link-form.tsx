'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, EyeSlash, LinkSimple, WarningCircle } from '@phosphor-icons/react';
import { apiClient, ApiError } from '@/lib/api-client';
import type {
  OAuthLinkRequest,
  OAuthLinkResponse,
  OAuthPendingResponse,
  Physician,
} from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthHeading, FieldError, subtleLinkClass } from '../../../_components/auth-ui';
import { OAUTH_PROVIDER_LABEL } from '../../../_components/oauth-buttons';

type LinkStep = Extract<OAuthPendingResponse, { kind: 'link' }>;

/**
 * CC-334 — já existe conta com o e-mail que o provedor confirmou. Vincular
 * nunca é automático: a senha da conta (uma vez) prova que é o dono; com MFA
 * ligado, o código vem em seguida e só então o vínculo é gravado.
 */
export function OAuthLinkForm({
  pending,
  onLinked,
  onMfaRequired,
}: {
  pending: LinkStep;
  onLinked: (physician: Physician) => void;
  onMfaRequired: (mfaToken: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const providerLabel = OAUTH_PROVIDER_LABEL[pending.provider];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!password) {
      setFieldError('Senha é obrigatória.');
      return;
    }

    setLoading(true);
    try {
      const body: OAuthLinkRequest = { password };
      const data = await apiClient.post<OAuthLinkResponse>('/auth/oauth/link', body);
      if (data.mfaRequired) onMfaRequired(data.mfaToken);
      else onLinked(data.physician);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // O apiClient troca a mensagem de todo 401 por "Sessão expirada" —
        // aqui o 401 significa senha incorreta.
        setFormError('Senha incorreta.');
      } else if (err instanceof ApiError && err.status === 429) {
        setFormError('Muitas tentativas. Aguarde um momento e tente novamente.');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Erro ao vincular a conta.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-8">
      <AuthHeading
        icon={
          <LinkSimple className="size-10 text-foreground" weight="duotone" aria-hidden="true" />
        }
        title={`Vincular sua conta ${providerLabel}`}
        description={`Já existe uma conta com este e-mail. Digite a senha dela uma vez para vincular — depois é só entrar com ${providerLabel}.`}
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-email">E-mail</Label>
          <Input
            id="link-email"
            type="email"
            value={pending.email}
            readOnly
            disabled
            autoComplete="username"
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-password">Senha</Label>
          <div className="relative">
            <Input
              id="link-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Sua senha"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldError('');
              }}
              autoComplete="current-password"
              autoFocus
              disabled={loading}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'link-password-error' : undefined}
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
          {fieldError && <FieldError id="link-password-error">{fieldError}</FieldError>}
        </div>

        {formError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="mt-1 w-full" loading={loading}>
          Vincular e entrar
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Não quer vincular?{' '}
        <Link href="/login" className={subtleLinkClass}>
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
