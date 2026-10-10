import { Badge } from '@/components/ui/badge';
import type { RedFlagSeverity } from '@/lib/types';
import { getStatusMeta, getVerticalMeta, SEVERITY_META } from './encounter-meta';

/** Tags do Notion para as propriedades do caso (lista e detalhe). */

export function StatusTag({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function VerticalTag({ vertical }: { vertical: string }) {
  const meta = getVerticalMeta(vertical);
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function SeverityTag({ severity }: { severity: RedFlagSeverity }) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} title="Maior gravidade de red flag na análise mais recente">
      <Icon weight="fill" aria-hidden="true" data-icon="inline-start" />
      {meta.label}
    </Badge>
  );
}
