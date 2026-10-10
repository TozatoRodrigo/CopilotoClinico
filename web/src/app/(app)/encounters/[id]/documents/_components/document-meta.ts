import type { Document } from '@/lib/types';
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types';

export type DocType = Document['type'];

/** Tons de categoria (sem peso clínico) — docs/design-system.md → "Cores". */
type CategoryTone = 'purple' | 'brown' | 'pink' | 'yellow' | 'gray';

/**
 * Tipo de documento é categoria, não estado clínico: cada tipo ganha uma tag
 * de cor de categoria e uma descrição curta para menus e títulos.
 */
export const DOC_TYPE_META: Record<DocType, { tone: CategoryTone; description: string }> = {
  soap: { tone: 'purple', description: 'Evolução clínica' },
  sbar: { tone: 'brown', description: 'Passagem de caso' },
  prescricao: { tone: 'pink', description: 'Medicamentos e orientações' },
  alta: { tone: 'yellow', description: 'Resumo de alta' },
  atestado: { tone: 'gray', description: 'Atestado médico' },
};

export function docTypeLabel(type: DocType): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

export function isConfirmed(doc: Pick<Document, 'confirmedBy'>): boolean {
  return doc.confirmedBy !== null;
}

export function extractString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "agora", "há 12 min", "hoje, 14:32", "ontem, 09:10", "03 de out., 18:05". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (isSameDay(date, new Date(now))) return `hoje, ${time}`;
  if (isSameDay(date, new Date(now - 86_400_000))) return `ontem, ${time}`;
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${day}, ${time}`;
}

/** Prévia em texto corrido do conteúdo (lista de documentos). */
export function contentPreview(content: Record<string, unknown>, max = 200): string {
  const text = Object.values(content)
    .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join(' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
