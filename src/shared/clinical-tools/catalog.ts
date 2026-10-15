import { CALCULATOR_CATALOG, type CalculatorCatalogEntry } from './calculator-catalog';
import { getCalculator } from './registry';

/**
 * Catálogo da área Ferramentas (ADR-017): os grupos do hub, as ferramentas
 * de beira-leito do ANY e a busca por nome e sinônimo. Ferramenta sem tela no
 * Copiloto fica "em breve": aparece na lista e na busca, mas não abre.
 */

export const TOOL_GROUPS = [
  { id: 'calculadoras', label: 'Calculadoras' },
  { id: 'ressuscitacao', label: 'Ressuscitação' },
  { id: 'via-aerea', label: 'Via aérea' },
  { id: 'choque-sepse', label: 'Choque e sepse' },
  { id: 'pediatria', label: 'Pediatria' },
  { id: 'toxicologia', label: 'Toxicologia' },
  { id: 'metabolico', label: 'Metabólico' },
  { id: 'ventilacao', label: 'Ventilação' },
  { id: 'sedacao-dor', label: 'Sedação e dor' },
  { id: 'paliativos', label: 'Paliativos' },
  { id: 'infecciosas', label: 'Infecciosas' },
] as const;

export type ToolGroupId = (typeof TOOL_GROUPS)[number]['id'];

const GROUP_LABEL = new Map<string, string>(TOOL_GROUPS.map(({ id, label }) => [id, label]));

export type ToolStatus = 'disponivel' | 'em-breve';

export interface ToolEntry {
  id: string;
  name: string;
  description: string;
  group: ToolGroupId;
  synonyms: readonly string[];
  status: ToolStatus;
}

/**
 * Roteiros e calculadoras de dose do ANY. Só a lista de calculadoras já tem
 * tela; cada roteiro ganha a sua na história indicada no comentário.
 */
export const TOOLS: readonly ToolEntry[] = [
  {
    id: 'calculadoras',
    name: 'Calculadoras clínicas',
    description: '75 escores e fórmulas, com interpretação e referência.',
    group: 'calculadoras',
    synonyms: ['escores', 'scores', 'mdcalc', 'fórmulas'],
    status: 'disponivel',
  },
  // CC-311 e CC-312
  {
    id: 'infusoes',
    name: 'Infusões contínuas',
    description: 'Drogas vasoativas e sedação: dose ↔ mL/h, heparina e insulina.',
    group: 'calculadoras',
    synonyms: [
      'bomba de infusão',
      'drogas vasoativas',
      'dva',
      'noradrenalina',
      'ml/h',
      'heparina',
      'insulina',
    ],
    status: 'em-breve',
  },
  // CC-313 e CC-314
  {
    id: 'acls',
    name: 'Parada cardiorrespiratória (ACLS)',
    description: 'Ciclos, adrenalina, choques, medicações e metrônomo.',
    group: 'ressuscitacao',
    synonyms: [
      'pcr',
      'parada',
      'rcp',
      'reanimação',
      'metrônomo',
      'adrenalina',
      'desfibrilação',
      'ovace',
    ],
    status: 'em-breve',
  },
  // CC-315
  {
    id: 'via-aerea',
    name: 'Intubação e via aérea difícil',
    description: 'Intubação em 11 passos, doses por peso e plano de resgate.',
    group: 'via-aerea',
    synonyms: ['iot', 'intubação', 'sequência rápida', 'isr', 'airway', 'cricotireoidostomia'],
    status: 'em-breve',
  },
  // CC-316
  {
    id: 'choque-septico',
    name: 'Choque séptico',
    description: 'ANDROMEDA-SHOCK 2: reconhecimento, fluidos, vasopressor e perfusão.',
    group: 'choque-sepse',
    synonyms: ['sepse', 'choque', 'andromeda', 'perfusão', 'enchimento capilar', 'lactato'],
    status: 'em-breve',
  },
  // CC-317
  {
    id: 'choque-indiferenciado',
    name: 'Choque indiferenciado',
    description: 'VNERi, gap CO2 × SvcO2 e débito cardíaco por VTI.',
    group: 'choque-sepse',
    synonyms: ['vneri', 'gap co2', 'svco2', 'vti', 'pocus', 'débito cardíaco'],
    status: 'em-breve',
  },
  // CC-318
  {
    id: 'tep',
    name: 'Tromboembolismo pulmonar',
    description: 'Estável × instável, classificação e calculadoras do TEP.',
    group: 'choque-sepse',
    synonyms: ['tep', 'embolia pulmonar', 'trombólise', 'wells', 'pesi'],
    status: 'em-breve',
  },
  // CC-319 a CC-321
  {
    id: 'pediatria',
    name: 'Emergência pediátrica',
    description: 'Broselow, doses e infusões por peso e cenários pediátricos.',
    group: 'pediatria',
    synonyms: [
      'ped',
      'criança',
      'broselow',
      'fita de broselow',
      'doses pediátricas',
      'dose por peso',
      'infusão pediátrica',
      'pals',
      'lactente',
      'neonato',
    ],
    status: 'disponivel',
  },
  // CC-323 e CC-324
  {
    id: 'toxicologia',
    name: 'Intoxicações e antídotos',
    description: 'Toxíndromes, descontaminação, antídotos e doses tóxicas.',
    group: 'toxicologia',
    synonyms: ['tox', 'intoxicação', 'envenenamento', 'antídoto', 'overdose', 'toxíndrome'],
    status: 'em-breve',
  },
  // CC-326
  {
    id: 'cad-ehh',
    name: 'CAD e EHH',
    description: 'Cetoacidose e estado hiperosmolar, da primeira hora à insulina subcutânea.',
    group: 'metabolico',
    synonyms: ['cetoacidose', 'cad', 'ehh', 'hiperosmolar', 'diabetes', 'insulina'],
    status: 'em-breve',
  },
  // CC-327
  {
    id: 'ventilacao-mecanica',
    name: 'Ventilação mecânica',
    description: 'Parâmetros iniciais, SDRA e HACOR.',
    group: 'ventilacao',
    synonyms: ['vm', 'ventilador', 'sdra', 'ards', 'hacor', 'peep', 'volume corrente'],
    status: 'em-breve',
  },
  // CC-328
  {
    id: 'sedacao',
    name: 'Sedação procedimental e agitação',
    description: 'Sedação para procedimento e manejo do paciente agitado.',
    group: 'sedacao-dor',
    synonyms: ['sedação', 'procedimento', 'agitação', 'cetamina', 'propofol'],
    status: 'em-breve',
  },
  // Sem história ainda: BlockPath do ANY.
  {
    id: 'bloqueios',
    name: 'Bloqueios regionais',
    description: 'Técnicas de anestesia regional para analgesia no PS.',
    group: 'sedacao-dor',
    synonyms: ['bloqueio', 'anestesia regional', 'nervo', 'analgesia'],
    status: 'em-breve',
  },
  // CC-329
  {
    id: 'paliativos',
    name: 'Cuidados paliativos no PS',
    description: 'Controle de sintomas e conforto no fim de vida.',
    group: 'paliativos',
    synonyms: ['paliativo', 'fim de vida', 'conforto', 'dispneia', 'sedação paliativa'],
    status: 'em-breve',
  },
  // CC-325
  {
    id: 'dengue',
    name: 'Dengue',
    description: 'Classificação A–D, hidratação por peso e alta segura.',
    group: 'infecciosas',
    synonyms: ['arbovirose', 'hidratação', 'sinais de alarme', 'grupo a b c d'],
    status: 'em-breve',
  },
];

/** Categorias das calculadoras, na ordem do ANY. */
export const CALCULATOR_CATEGORIES: readonly string[] = [
  ...new Set(CALCULATOR_CATALOG.map(({ category }) => category)),
];

export function calculatorStatus(entry: CalculatorCatalogEntry): ToolStatus {
  return getCalculator(entry.id) ? 'disponivel' : 'em-breve';
}

/** Nome na tela: o da definição portada, quando houver; senão o do catálogo. */
export function calculatorName(entry: CalculatorCatalogEntry): string {
  return getCalculator(entry.id)?.name ?? entry.name;
}

export type ToolSearchResult =
  | { kind: 'tool'; tool: ToolEntry; status: ToolStatus }
  | { kind: 'calculator'; calculator: CalculatorCatalogEntry; status: ToolStatus };

/** Minúsculas e sem acento: "Ressuscitação" e "ressuscitacao" se encontram. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function rank(
  name: string,
  extra: readonly string[],
  tokens: readonly string[],
  query: string,
): number {
  const normalizedName = normalizeSearchText(name);
  const haystack = normalizeSearchText([name, ...extra].join(' '));
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  if (normalizedName.startsWith(query)) return 3;
  if (normalizedName.includes(query)) return 2;
  return 1;
}

/**
 * Busca por nome e sinônimo em ferramentas e calculadoras (também pelo grupo
 * e pela categoria: "pediatria" acha o que está em Pediatria). Todas as
 * palavras da busca precisam aparecer; nome que começa com a busca vem
 * primeiro, e o que já abre vem antes do "em breve".
 */
export function searchTools(query: string): ToolSearchResult[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return [];
  const tokens = normalized.split(/\s+/);

  const scored: { result: ToolSearchResult; score: number; name: string }[] = [];
  for (const tool of TOOLS) {
    const group = GROUP_LABEL.get(tool.group) ?? '';
    const score = rank(tool.name, [...tool.synonyms, tool.description, group], tokens, normalized);
    if (score > 0) {
      scored.push({ result: { kind: 'tool', tool, status: tool.status }, score, name: tool.name });
    }
  }
  for (const calculator of CALCULATOR_CATALOG) {
    const name = calculatorName(calculator);
    const score = rank(
      name,
      [calculator.name, ...calculator.aliases, calculator.category],
      tokens,
      normalized,
    );
    if (score > 0) {
      scored.push({
        result: { kind: 'calculator', calculator, status: calculatorStatus(calculator) },
        score,
        name,
      });
    }
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.result.status === 'disponivel') - Number(a.result.status === 'disponivel') ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )
    .map(({ result }) => result);
}
