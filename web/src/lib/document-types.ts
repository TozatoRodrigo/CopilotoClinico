import type { DocumentType } from '@/lib/types';

/**
 * RD-E7 — lista única de tipos de documento (ordem + rótulo), compartilhada
 * entre a tela de Análise (botões "Gerar documento") e a barra de abas da
 * tela Documento. Antes duplicada como array local em result/page.tsx e
 * como TYPE_LABELS em edit/page.tsx — um só lugar agora para adicionar um
 * tipo novo de documento no futuro.
 */
export const DOCUMENT_TYPES: { type: DocumentType; label: string; primary?: boolean }[] = [
  { type: 'soap', label: 'SOAP', primary: true },
  { type: 'sbar', label: 'SBAR' },
  { type: 'prescricao', label: 'Prescrição' },
  { type: 'alta', label: 'Alta' },
  { type: 'atestado', label: 'Atestado' },
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = DOCUMENT_TYPES.reduce(
  (acc, dt) => {
    acc[dt.type] = dt.label;
    return acc;
  },
  {} as Record<DocumentType, string>,
);
