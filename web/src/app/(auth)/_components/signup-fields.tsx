'use client';

/**
 * Campos do cadastro compartilhados pelo cadastro por e-mail e pelo cadastro
 * que vem do login com Google/Microsoft (CC-334): CRM (sem ele não há conta),
 * aviso da verificação do CRM e aceite da Política de Privacidade.
 */
import Link from 'next/link';
import { IdentificationCard } from '@phosphor-icons/react';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldError, subtleLinkClass } from './auth-ui';

export function CrmPendingNotice() {
  return (
    <Callout tone="blue" icon={<IdentificationCard />} className="text-[0.8125rem]">
      Seu CRM será verificado. Até a aprovação, seus documentos terão selo &quot;CRM pendente&quot;
      — você pode usar o sistema normalmente.
    </Callout>
  );
}

export function PrivacyConsentField({
  checked,
  onChange,
  error,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? 'consent-error' : undefined}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
        />
        <span className="text-[0.8125rem] text-muted-foreground">
          Li e aceito a{' '}
          <Link
            href="/privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className={subtleLinkClass}
          >
            Política de Privacidade
          </Link>
          . Meus dados serão processados conforme a LGPD para prestação deste serviço médico.
        </span>
      </label>
      {error && <FieldError id="consent-error">{error}</FieldError>}
    </div>
  );
}

export const CRM_UF_OPTIONS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

export interface CrmFieldErrors {
  crmUf?: string;
  crmNumber?: string;
}

export function CrmFields({
  crmUf,
  crmNumber,
  onCrmUfChange,
  onCrmNumberChange,
  errors,
  disabled,
}: {
  crmUf: string;
  crmNumber: string;
  onCrmUfChange: (value: string) => void;
  onCrmNumberChange: (value: string) => void;
  errors: CrmFieldErrors;
  disabled: boolean;
}) {
  const crmError = errors.crmUf ?? errors.crmNumber;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Label htmlFor="crmUf">UF do CRM</Label>
        <Label htmlFor="crmNumber">Número do CRM</Label>
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Select value={crmUf} onValueChange={onCrmUfChange} disabled={disabled}>
          <SelectTrigger
            id="crmUf"
            className="w-full data-[size=default]:h-10"
            aria-invalid={!!errors.crmUf}
            aria-describedby={crmError ? 'crm-error' : undefined}
          >
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            {CRM_UF_OPTIONS.map((uf) => (
              <SelectItem key={uf} value={uf}>
                {uf}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id="crmNumber"
          type="text"
          inputMode="numeric"
          placeholder="12345"
          value={crmNumber}
          onChange={(e) => onCrmNumberChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!errors.crmNumber}
          aria-describedby={crmError ? 'crm-error' : undefined}
          className="h-10"
        />
      </div>
      {crmError && (
        <FieldError id="crm-error">
          {[errors.crmUf, errors.crmNumber].filter(Boolean).join(' ')}
        </FieldError>
      )}
    </div>
  );
}
