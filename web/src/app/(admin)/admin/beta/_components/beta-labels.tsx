'use client';

import {
  CheckCircle,
  Clock,
  Prohibit,
  SealCheck,
  Hourglass,
  EnvelopeSimple,
  type Icon,
} from '@phosphor-icons/react';
import type { BetaInviteStatus, BetaProfile, BetaWaitlistStatus } from '@contracts/beta';
import {
  BETA_CITY_TYPE_LABELS,
  BETA_FACILITY_TYPE_LABELS,
  BETA_TRAINING_LABELS,
} from '@/lib/beta-contract';
import { Badge } from '@/components/ui/badge';

interface TagDef {
  label: string;
  variant: 'success' | 'warning' | 'secondary' | 'destructive' | 'blue' | 'gray';
  icon: Icon;
}

/** Verde = ainda serve; cinza = acabou (usado ou vencido); vermelho = revogado. */
export const INVITE_STATUS_TAG: Record<BetaInviteStatus, TagDef> = {
  active: { label: 'Ativo', variant: 'success', icon: CheckCircle },
  exhausted: { label: 'Usado', variant: 'gray', icon: SealCheck },
  expired: { label: 'Vencido', variant: 'secondary', icon: Hourglass },
  revoked: { label: 'Revogado', variant: 'destructive', icon: Prohibit },
};

/** Laranja pede ação (aguardando convite). */
export const WAITLIST_STATUS_TAG: Record<BetaWaitlistStatus, TagDef> = {
  waiting: { label: 'Aguardando', variant: 'warning', icon: Clock },
  invited: { label: 'Convidado', variant: 'blue', icon: EnvelopeSimple },
  registered: { label: 'Cadastrado', variant: 'success', icon: SealCheck },
};

export function StatusTag({ tag }: { tag: TagDef }) {
  const TagIcon = tag.icon;
  return (
    <Badge variant={tag.variant}>
      <TagIcon weight="bold" aria-hidden="true" />
      {tag.label}
    </Badge>
  );
}

/** "Recém-formado… · UPA 24h porte I · MG · Interior"; vazio sem perfil. */
export function profileSummary(profile: Partial<BetaProfile>): string {
  return [
    profile.training && BETA_TRAINING_LABELS[profile.training],
    profile.facilityType && BETA_FACILITY_TYPE_LABELS[profile.facilityType],
    profile.uf,
    profile.cityType && BETA_CITY_TYPE_LABELS[profile.cityType],
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "15/10/2026". */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** 0.734 → "73%"; `null` → "—". */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
