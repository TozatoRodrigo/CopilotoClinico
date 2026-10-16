'use client';

import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  contextFromSite,
  describeSite,
  NO_SITE,
  selectedSiteValue,
  withoutSite,
} from '@/lib/practice-sites';
import type { EncounterContext, PracticeSite } from '@/lib/types';

/**
 * CC-602 — o local de plantão do caso. O caso nasce com o local padrão
 * (Configurações → Locais de plantão) e o médico troca aqui: escolher um
 * local troca os recursos marcados; "Sem local" mantém os recursos e tira o
 * local (aí um recurso desmarcado é "não marcado", não "o serviço não tem").
 */
export function PracticeSiteSelect({
  id,
  sites,
  context,
  onChange,
  disabled,
}: {
  id: string;
  sites: readonly PracticeSite[];
  context: EncounterContext;
  onChange: (next: EncounterContext) => void;
  disabled?: boolean;
}) {
  const value = selectedSiteValue(context);
  // O local do caso pode ser de um perfil já apagado: continua escolhível.
  const caseOnlySite =
    context.site && !sites.some((site) => site.id === context.site?.siteId) ? context.site : null;

  function handleChange(next: string) {
    if (next === NO_SITE) {
      onChange(withoutSite(context));
      return;
    }
    const site = sites.find((candidate) => candidate.id === next);
    if (site) onChange(contextFromSite(site));
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full sm:w-72" aria-label="Local do plantão">
          <SelectValue placeholder="Local do plantão" />
        </SelectTrigger>
        <SelectContent>
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.isDefault ? `${site.name} (padrão)` : site.name}
            </SelectItem>
          ))}
          {caseOnlySite && (
            <SelectItem value={value}>{`${caseOnlySite.name} (deste caso)`}</SelectItem>
          )}
          <SelectItem value={NO_SITE}>Sem local declarado</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[0.8125rem] text-muted-foreground">
        {context.site ? (
          describeSite(context.site, context)
        ) : sites.length === 0 ? (
          <>
            Salve onde você dá plantão em{' '}
            <Link
              href="/settings?tab=locais"
              className="text-link underline-offset-4 hover:underline"
            >
              Configurações → Locais de plantão
            </Link>{' '}
            para o caso já vir preenchido.
          </>
        ) : (
          'Sem local declarado: recurso desmarcado conta como não informado.'
        )}
      </p>
    </div>
  );
}
