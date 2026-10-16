import { extractString, type DocType } from './document-meta';

export type Content = Record<string, unknown>;

/** Texto de cada campo editável, como está na tela. */
export type EditableValues = Record<string, string>;

export interface FieldDef {
  key: string;
  label: string;
  rows?: number;
}

export const SECTION_FIELDS: Record<string, FieldDef[]> = {
  soap: [
    { key: 'subjective', label: 'Subjetivo' },
    { key: 'objective', label: 'Objetivo' },
    { key: 'assessment', label: 'Avaliação' },
    { key: 'plan', label: 'Plano' },
  ],
  sbar: [
    { key: 'situation', label: 'Situação' },
    { key: 'background', label: 'Background' },
    { key: 'assessment', label: 'Avaliação' },
    { key: 'recommendation', label: 'Recomendação' },
  ],
  prescricao: [
    { key: 'paciente', label: 'Paciente', rows: 1 },
    { key: 'data', label: 'Data', rows: 1 },
    { key: 'orientacoes', label: 'Orientações', rows: 5 },
  ],
  alta: [
    { key: 'paciente', label: 'Paciente', rows: 1 },
    { key: 'data', label: 'Data', rows: 1 },
    { key: 'resumo', label: 'Resumo', rows: 4 },
    { key: 'condicaoNaAlta', label: 'Condição na Alta' },
    { key: 'retorno', label: 'Retorno' },
  ],
  atestado: [
    { key: 'paciente', label: 'Paciente', rows: 1 },
    { key: 'data', label: 'Data', rows: 1 },
    { key: 'descricao', label: 'Descrição', rows: 4 },
    { key: 'assinaturaPlaceholder', label: 'Assinatura', rows: 3 },
  ],
};

/**
 * Listas (medicamentos da prescrição, diagnósticos da alta): editadas como
 * texto, um item por linha, gravadas em `<campo>_raw` nas edições do médico.
 */
export interface ListFieldDef {
  id: string;
  source: string;
  label: string;
  hint: string;
  minRows: number;
}

export const LIST_FIELDS: Partial<Record<DocType, ListFieldDef>> = {
  prescricao: {
    id: 'medicamentos_raw',
    source: 'medicamentos',
    label: 'Medicamentos',
    hint: 'Um por linha — medicamento, dosagem, via, frequência, duração',
    minRows: 3,
  },
  alta: {
    id: 'diagnosticos_raw',
    source: 'diagnosticos',
    label: 'Diagnósticos',
    hint: 'Um por linha',
    minRows: 2,
  },
};

/**
 * Campos de texto da tela: as seções do tipo e, se o médico já mexeu nela, a
 * lista como texto livre (`<campo>_raw`).
 */
export function editableValues(type: DocType, content: Content): EditableValues {
  const values: EditableValues = {};
  for (const field of SECTION_FIELDS[type] ?? []) {
    values[field.key] = extractString(content[field.key]);
  }
  const list = LIST_FIELDS[type];
  const raw = list ? content[list.id] : undefined;
  if (list && typeof raw === 'string') values[list.id] = raw;
  return values;
}

/**
 * Edições a gravar: o conteúdo gerado com os campos de texto da tela por
 * cima. A lista estruturada, `incerteza` e os demais campos que o editor não
 * mostra seguem como a IA gerou — o confirm sela `physicianEdits ?? content`,
 * e uma lista achatada em texto sairia do documento assinado e do PDF.
 */
export function buildPhysicianEdits(aiContent: Content, values: EditableValues): Content {
  return { ...aiContent, ...values };
}

/**
 * Mesmo formato do PDF (formatMedicamentoItem em
 * src/modules/documents/pdf/document-pdf.builder.ts), para a lista editada
 * em texto sair igual à estruturada: "Dipirona — 1 g, IV, 6/6h, 3 dias".
 */
function formatListItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item);
  const m = item as Record<string, unknown>;
  const name = typeof m.medicamento === 'string' ? m.medicamento.trim() : '';
  const details = [m.dosagem, m.via, m.frequencia, m.duracao]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ');
  return details ? `${name} — ${details}` : name;
}

/** A lista estruturada como texto, um item por linha. */
export function formatListItems(items: unknown): string {
  if (!Array.isArray(items)) return '';
  return items.map(formatListItem).filter(Boolean).join('\n');
}

/** Diferença entre o conteúdo local e o último salvo (indicador "Salvo"). */
export function changedKeys(local: EditableValues, reference: EditableValues): string[] {
  return Object.keys(local).filter((key) => local[key] !== reference[key]);
}

/** Seções cujo texto difere do rascunho original da IA. */
export function editedSections(type: DocType, values: EditableValues, aiContent: Content): string[] {
  const edited = (SECTION_FIELDS[type] ?? [])
    .filter((f) => (values[f.key] ?? '') !== extractString(aiContent[f.key]))
    .map((f) => f.key);
  const list = LIST_FIELDS[type];
  if (list) {
    const raw = values[list.id];
    if (raw !== undefined && raw !== formatListItems(aiContent[list.source])) edited.push(list.id);
  }
  return edited;
}
