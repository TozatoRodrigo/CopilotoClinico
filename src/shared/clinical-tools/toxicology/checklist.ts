/**
 * Checklist de avaliação do intoxicado (CC-323): as 6 seções e os 32 itens
 * do ToxPath do ANY, do ABCDE aos odores. Só marca o que foi examinado; não
 * calcula nada.
 */

export interface ExamChecklistItem {
  id: string;
  label: string;
  hint: string;
}

export interface ExamChecklistSection {
  id: string;
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  title: string;
  items: readonly ExamChecklistItem[];
}

export const EXAM_CHECKLIST: readonly ExamChecklistSection[] = [
  {
    id: 'estabilizacao',
    letter: 'A',
    title: 'Estabilização inicial (ABCDE)',
    items: [
      {
        id: 'via-aerea',
        label: 'Via aérea pérvia',
        hint: 'Verificar patência, secreções, estridor',
      },
      {
        id: 'respiracao',
        label: 'Respiração adequada',
        hint: 'FR, SpO₂, padrão respiratório, ausculta',
      },
      { id: 'circulacao', label: 'Circulação estável', hint: 'FC, PA, TEC, pulsos periféricos' },
      {
        id: 'glasgow',
        label: 'Nível de consciência (Glasgow)',
        hint: 'Avaliar resposta ocular, verbal e motora',
      },
      {
        id: 'glicemia',
        label: 'Glicemia capilar',
        hint: 'Recomendado se alteração de consciência',
      },
      {
        id: 'exposicao',
        label: 'Exposição completa',
        hint: 'Buscar patches, marcas de agulha, lesões',
      },
    ],
  },
  {
    id: 'sinais-vitais',
    letter: 'B',
    title: 'Sinais vitais detalhados',
    items: [
      { id: 'fc', label: 'Frequência cardíaca', hint: 'Taqui (>100) ou bradicardia (<60)' },
      { id: 'pa', label: 'Pressão arterial', hint: 'Hiper ou hipotensão' },
      {
        id: 'fr',
        label: 'Frequência respiratória',
        hint: 'Contar por 1 minuto (normal: 12-20)',
      },
      {
        id: 'temperatura',
        label: 'Temperatura axilar/central',
        hint: 'Hiper (>38) ou hipotermia (<35)',
      },
      {
        id: 'saturacao',
        label: 'Saturação de O2',
        hint: 'Atenção: SpO₂ pode ser falsa em MetHb e CO',
      },
    ],
  },
  {
    id: 'neuro',
    letter: 'C',
    title: 'Exame neurológico',
    items: [
      {
        id: 'pupilas',
        label: 'Pupilas (tamanho e reatividade)',
        hint: 'Midríase, miose, anisocoria',
      },
      { id: 'nistagmo', label: 'Nistagmo', hint: 'Horizontal, vertical, rotatório' },
      { id: 'tonus', label: 'Tônus muscular', hint: 'Rigidez, flacidez, espasticidade' },
      { id: 'reflexos', label: 'Reflexos tendinosos', hint: 'Hiper ou hiporreflexia' },
      { id: 'clonus', label: 'Clonus', hint: 'Testar em tornozelos (≥3 batidas = positivo)' },
      {
        id: 'tremores',
        label: 'Tremores / Fasciculações',
        hint: 'Tipo, localização, frequência',
      },
      { id: 'convulsoes', label: 'Convulsões', hint: 'Tipo, duração, pós-ictal' },
    ],
  },
  {
    id: 'pele',
    letter: 'D',
    title: 'Pele e mucosas',
    items: [
      { id: 'umidade', label: 'Umidade da pele', hint: 'Seca vs. diaforética (axilas, tórax)' },
      { id: 'coloracao', label: 'Coloração', hint: 'Rubor, palidez, cianose, icterícia' },
      { id: 'temperatura-cutanea', label: 'Temperatura cutânea', hint: 'Quente vs. fria' },
      { id: 'mucosas', label: 'Mucosas orais', hint: 'Secas, úmidas, lesões, sialorreia' },
      {
        id: 'puncao',
        label: 'Marcas de punção / Patches',
        hint: 'Buscar em braços, virilha, pescoço',
      },
    ],
  },
  {
    id: 'abdome',
    letter: 'E',
    title: 'Abdome e secreções',
    items: [
      { id: 'rha', label: 'Ruídos hidroaéreos', hint: 'Aumentados, diminuídos, ausentes' },
      {
        id: 'distensao',
        label: 'Distensão abdominal',
        hint: 'Bexiga palpável (retenção urinária)',
      },
      { id: 'sialorreia', label: 'Sialorreia', hint: 'Salivação excessiva' },
      { id: 'lacrimejamento', label: 'Lacrimejamento', hint: 'Excessivo (colinérgico)' },
      { id: 'broncorreia', label: 'Broncorreia / Rinorreia', hint: 'Secreções em VA' },
    ],
  },
  {
    id: 'odores',
    letter: 'F',
    title: 'Odores característicos',
    items: [
      { id: 'etilico', label: 'Hálito etílico', hint: 'Álcool etílico' },
      { id: 'alho', label: 'Odor de alho', hint: 'Organofosforados, arsênico' },
      {
        id: 'amendoas',
        label: 'Odor de amêndoas amargas',
        hint: 'Cianeto (nem todos sentem)',
      },
      { id: 'acetona', label: 'Odor de acetona / frutas', hint: 'Cetoacidose, isopropanol' },
    ],
  },
];

/** Chave única de um item ("neuro:clonus"): ids de item se repetem entre seções. */
export function checklistItemKey(section: ExamChecklistSection, item: ExamChecklistItem): string {
  return `${section.id}:${item.id}`;
}

export const EXAM_CHECKLIST_TOTAL = EXAM_CHECKLIST.reduce(
  (total, section) => total + section.items.length,
  0,
);

export interface ChecklistProgress {
  checked: number;
  total: number;
  /** Por seção, para o "n/total" de cada uma. */
  bySection: Readonly<Record<string, number>>;
}

export function checklistProgress(checkedKeys: Iterable<string>): ChecklistProgress {
  const keys = new Set(checkedKeys);
  const bySection: Record<string, number> = {};
  let checked = 0;
  for (const section of EXAM_CHECKLIST) {
    const count = section.items.filter((item) => keys.has(checklistItemKey(section, item))).length;
    bySection[section.id] = count;
    checked += count;
  }
  return { checked, total: EXAM_CHECKLIST_TOTAL, bySection };
}
