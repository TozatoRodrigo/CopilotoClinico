import type { ElementType } from 'react';
import type { VariantProps } from 'class-variance-authority';
import {
  Baby,
  Brain,
  FirstAidKit,
  Heartbeat,
  Stethoscope,
  Warning,
  WarningCircle,
  WarningOctagon,
} from '@phosphor-icons/react';
import type { badgeVariants } from '@/components/ui/badge';
import type { Tone } from '@/lib/tone';
import type { EncounterStatus, EncounterVertical, RedFlagSeverity } from '@/lib/types';

/**
 * Rótulos, tons e ícones do caso compartilhados pela lista (/encounters) e
 * pelo detalhe (/encounters/[id]). Cores seguem a semântica clínica fixa de
 * docs/design-system.md: status usa azul (em revisão), verde (assinado) e
 * cinza (rascunho/cancelado); vertical é categoria sem peso clínico, então
 * usa os tons de categoria do Notion.
 */

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

// S20-I18N-01 — status sempre localizado; nunca exibir o slug cru
// (in_review, draft...). `finalized` = documento confirmado e assinado
// (DocumentsService.confirm), por isso "Assinado", como no Plantão.
export const STATUS_META: Record<EncounterStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  in_review: { label: 'Em revisão', variant: 'default' },
  finalized: { label: 'Assinado', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
};

export function getStatusMeta(status: string): { label: string; variant: BadgeVariant } {
  return STATUS_META[status as EncounterStatus] ?? { label: status, variant: 'secondary' };
}

export const VERTICAL_META: Record<
  EncounterVertical,
  { label: string; tone: Extract<Tone, 'gray' | 'brown' | 'yellow' | 'purple' | 'pink'>; icon: ElementType }
> = {
  trauma: { label: 'Trauma', tone: 'brown', icon: FirstAidKit },
  cardiac: { label: 'Cardíaco', tone: 'pink', icon: Heartbeat },
  pediatric: { label: 'Pediátrico', tone: 'yellow', icon: Baby },
  neuro: { label: 'Neuro', tone: 'purple', icon: Brain },
  general: { label: 'Geral', tone: 'gray', icon: Stethoscope },
};

export const VERTICAL_OPTIONS = Object.entries(VERTICAL_META).map(([value, meta]) => ({
  value: value as EncounterVertical,
  label: meta.label,
}));

export function getVerticalMeta(vertical: string) {
  return (
    VERTICAL_META[vertical as EncounterVertical] ?? {
      label: vertical,
      tone: 'gray' as const,
      icon: Stethoscope,
    }
  );
}

/**
 * PI-01 — maior gravidade de red flag da análise mais recente. Mesma régua do
 * resultado (encounters/[id]/result): crítica = vermelho, alta = laranja
 * (muda a conduta), moderada = neutro. Sempre com texto e ícone, nunca só cor.
 */
export const SEVERITY_META: Record<
  RedFlagSeverity,
  { label: string; variant: BadgeVariant; icon: ElementType }
> = {
  critical: { label: 'Crítica', variant: 'destructive', icon: WarningOctagon },
  high: { label: 'Alta', variant: 'warning', icon: Warning },
  moderate: { label: 'Moderada', variant: 'secondary', icon: WarningCircle },
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  soap: 'SOAP',
  sbar: 'SBAR',
  prescricao: 'Prescrição',
  alta: 'Alta',
  atestado: 'Atestado',
};

// "Prescrição"/"Alta" são femininos: "Prescrição gerada", não "gerado".
const FEMININE_DOC_TYPES = new Set(['prescricao', 'alta']);

export function docEventTitle(type: string, event: 'generated' | 'confirmed'): string {
  const label = DOC_TYPE_LABELS[type] ?? type;
  const feminine = FEMININE_DOC_TYPES.has(type);
  if (event === 'confirmed') return `${label} ${feminine ? 'confirmada' : 'confirmado'}`;
  return `${label} ${feminine ? 'gerada' : 'gerado'}`;
}

/** Título do caso — mesma regra do Plantão (RD-E7 / S25-QC-01). */
export function encounterTitle(encounter: {
  chiefComplaint: string | null;
  patientRef: string | null;
}): string {
  return encounter.chiefComplaint ?? encounter.patientRef ?? 'Consulta rápida';
}

/** "agora", "há 12 min", "há 3 h", "há 2 dias", "08 de out." */
export function formatRelative(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "10/10, 09:52" — data curta para colunas de tabela. */
export function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
