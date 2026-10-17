'use client';

/**
 * CC-334 — "Entrar com Google/Microsoft". A API diz quais provedores têm
 * cliente configurado; sem nenhum (ou se a consulta falhar), nada aparece e a
 * tela fica como antes. O botão é um link de navegação: o fluxo OAuth inteiro
 * roda no backend e volta para /login/oauth.
 */
import { useQuery } from '@tanstack/react-query';
import { GoogleLogo, WindowsLogo, type Icon } from '@phosphor-icons/react';
import { API_BASE_URL, apiClient } from '@/lib/api-client';
import type { OAuthProviderId, OAuthProvidersResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';

export const OAUTH_PROVIDER_LABEL: Record<OAuthProviderId, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

const PROVIDER_ICON: Record<OAuthProviderId, Icon> = {
  google: GoogleLogo,
  microsoft: WindowsLogo,
};

export function oauthStartUrl(provider: OAuthProviderId): string {
  return `${API_BASE_URL}/auth/oauth/${provider}/start`;
}

export function OAuthButtons({ verb }: { verb: 'Entrar' | 'Cadastrar' }) {
  const { data } = useQuery({
    queryKey: ['auth', 'oauth-providers'],
    queryFn: () => apiClient.get<OAuthProvidersResponse>('/auth/oauth/providers'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const providers = data?.providers ?? [];
  if (providers.length === 0) return null;

  return (
    // -mb-4: o divisor fica a 16px do formulário, como fica dos botões.
    <div className="-mb-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {providers.map((provider) => {
          const ProviderIcon = PROVIDER_ICON[provider];
          return (
            <Button key={provider} asChild variant="outline" size="lg" className="w-full">
              <a href={oauthStartUrl(provider)}>
                <ProviderIcon weight="bold" aria-hidden="true" />
                {verb} com {OAUTH_PROVIDER_LABEL[provider]}
              </a>
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
