/**
 * CC-335/CC-336 — instantâneo dos ids das Ferramentas do Copiloto (ADR-017),
 * para a migração do ANY sem depender do código das Ferramentas.
 *
 * Copiado de `feat/ferramentas-any-integrado` (e2195757):
 * - `COPILOTO_TOOL_IDS` = `TOOLS` de src/shared/clinical-tools/catalog.ts;
 * - `COPILOTO_CALCULATORS` = `CALCULATOR_CATALOG` de calculator-catalog.ts
 *   (`id` vira URL; `anyId` é o id do ANY, com acento, como os favoritos de
 *   lá guardam);
 * - `COPILOTO_TOOL_SUBPAGES` = as páginas fixas de
 *   web/src/app/(app)/ferramentas/<id>/<subpágina>.
 *
 * Quando as Ferramentas entrarem na base, `copiloto-tools-snapshot.spec.ts`
 * passa a conferir este instantâneo contra o catálogo e as páginas de
 * verdade, e falha se algum id daqui deixar de existir lá.
 */

export const COPILOTO_TOOL_IDS = [
  'calculadoras',
  'infusoes',
  'acls',
  'via-aerea',
  'choque-septico',
  'choque-indiferenciado',
  'tep',
  'pediatria',
  'toxicologia',
  'cad-ehh',
  'ventilacao-mecanica',
  'sedacao',
  'bloqueios',
  'paliativos',
  'dengue',
] as const;

export type CopilotoToolId = (typeof COPILOTO_TOOL_IDS)[number];

/** Na ordem do ANY (16 categorias). Só as 9 com acento têm `anyId` diferente. */
export const COPILOTO_CALCULATORS = [
  // Cardiologia / SCA
  { id: 'heart-score', anyId: 'heart-score' },
  { id: 'timi-nstemi', anyId: 'timi-nstemi' },
  { id: 'grace-score', anyId: 'grace-score' },
  { id: 'chadsvasc', anyId: 'chadsvasc' },
  { id: 'has-bled', anyId: 'has-bled' },
  { id: 'egsys', anyId: 'egsys' },
  { id: 'sf-syncope', anyId: 'sf-syncope' },
  // Neurologia
  { id: 'hunt-hess', anyId: 'hunt-hess' },
  { id: 'fisher-modificado', anyId: 'fisher-modificado' },
  { id: 'four-score', anyId: 'four-score' },
  { id: 'ottawa-hsa', anyId: 'ottawa-hsa' },
  { id: 'hints-plus', anyId: 'hints-plus' },
  { id: 'cam-icu', anyId: 'cam-icu' },
  { id: 'nihss', anyId: 'nihss' },
  { id: 'gcs', anyId: 'gcs' },
  { id: 'abcd2', anyId: 'abcd2' },
  { id: 'ich-score', anyId: 'ich-score' },
  { id: 'abc2', anyId: 'abc2' },
  // Gastro / Hepato
  { id: 'rockall', anyId: 'rockall' },
  { id: 'glasgow-blatchford', anyId: 'glasgow-blatchford' },
  { id: 'forrest', anyId: 'forrest' },
  { id: 'child-pugh', anyId: 'child-pugh' },
  { id: 'meld-na', anyId: 'meld-na' },
  { id: 'bonacini', anyId: 'bonacini' },
  { id: 'alvarado', anyId: 'alvarado' },
  // Trauma
  { id: 'tash', anyId: 'tash' },
  { id: 'pecarn', anyId: 'pecarn' },
  { id: 'mbig', anyId: 'mbig' },
  { id: 'canadian-cspine', anyId: 'canadian-cspine' },
  { id: 'parkland', anyId: 'parkland' },
  // Hemodinâmica
  { id: 'dc-vti', anyId: 'dc-vti' },
  { id: 'gradiente-aa', anyId: 'gradiente-aa' },
  { id: 'delta-gap', anyId: 'delta-gap' },
  { id: 'shock-index', anyId: 'shock-index' },
  { id: 'pam', anyId: 'pam' },
  { id: 'formula-winters', anyId: 'fórmula-winters' },
  // Respiratório / Sepse
  { id: 'curb65', anyId: 'curb65' },
  { id: 'qsofa', anyId: 'qsofa' },
  { id: 'sofa', anyId: 'sofa' },
  { id: 'tempo-o2', anyId: 'tempo-o2' },
  { id: 'news2', anyId: 'news2' },
  { id: 'criterios-light', anyId: 'critérios-light' },
  { id: 'apache-ii', anyId: 'apache-ii' },
  // Toxicologia
  { id: 'ciwa-ar', anyId: 'ciwa-ar' },
  { id: 'pss', anyId: 'pss' },
  { id: 'nomograma-rumack', anyId: 'nomograma-rumack' },
  { id: 'qtc-corrigido', anyId: 'qtc-corrigido' },
  { id: 'intervalo-osmolar', anyId: 'intervalo-osmolar' },
  // Farmacologia
  { id: 'corticoide-equiv', anyId: 'corticoide-equiv' },
  // Renal / Metabólico
  { id: 'akin-kdigo', anyId: 'akin-kdigo' },
  { id: 'correcao-na', anyId: 'correção-na' },
  { id: 'deficit-agua', anyId: 'déficit-agua' },
  { id: 'osmolaridade', anyId: 'osmolaridade' },
  { id: 'correcao-na-adrogue', anyId: 'correção-na-adrogue' },
  { id: 'cockcroft-gault', anyId: 'cockcroft-gault' },
  { id: 'ckd-epi', anyId: 'ckd-epi' },
  { id: 'correcao-calcio', anyId: 'correção-cálcio' },
  { id: 'correcao-potassio', anyId: 'correção-potássio' },
  { id: 'anion-gap', anyId: 'anion-gap' },
  // Vascular
  { id: 'add-rs', anyId: 'add-rs' },
  { id: 'caprini', anyId: 'caprini' },
  { id: 'perc-rule', anyId: 'perc-rule' },
  // Procedimentos
  { id: 'posicao-cvc', anyId: 'posição-cvc' },
  // Obstetrícia
  { id: 'dpp-dum', anyId: 'dpp-dum' },
  { id: 'bishop', anyId: 'bishop' },
  { id: 'idade-gestacional', anyId: 'idade-gestacional' },
  { id: 'hellp', anyId: 'hellp' },
  { id: 'mgso4-dose', anyId: 'mgso4-dose' },
  // Via aérea
  { id: 'cormack-lehane', anyId: 'cormack-lehane' },
  { id: 'mallampati', anyId: 'mallampati' },
  // Infecção
  { id: 'centor-mcisaac', anyId: 'centor-mcisaac' },
  // Sedação / Dor
  { id: 'rass', anyId: 'rass' },
  { id: 'bps', anyId: 'bps' },
  { id: 'eva-nrs', anyId: 'eva-nrs' },
  // POCUS / Hemodinâmica
  { id: 'vti-classificacao', anyId: 'vti-classificação' },
] as const;

export type CopilotoCalculatorId = (typeof COPILOTO_CALCULATORS)[number]['id'];

/** Subpáginas fixas (sem parâmetro) de cada roteiro. */
export const COPILOTO_TOOL_SUBPAGES = {
  acls: ['historico', 'ovace'],
  bloqueios: ['dose-maxima', 'evolucao', 'last', 'lista', 'topografia'],
  toxicologia: [
    'antidotos',
    'checklist',
    'descontaminacao',
    'destino',
    'doses-toxicas',
    'tabelas',
    'toxindromes',
  ],
} as const satisfies Partial<Record<CopilotoToolId, readonly string[]>>;

type Subpages = typeof COPILOTO_TOOL_SUBPAGES;
type SubpagePath = {
  [Tool in keyof Subpages]: `/ferramentas/${Tool}/${Subpages[Tool][number]}`;
}[keyof Subpages];

/** Toda rota das Ferramentas que pode ser destino de um link ou redirecionamento. */
export type CopilotoToolPath =
  | '/ferramentas'
  | `/ferramentas/${CopilotoToolId}`
  | SubpagePath
  | `/ferramentas/calculadoras/${CopilotoCalculatorId}`;

/** As mesmas rotas, para conferir em tempo de execução (teste e gerador). */
export function copilotoToolPaths(): ReadonlySet<string> {
  const paths = new Set<string>(['/ferramentas']);
  for (const tool of COPILOTO_TOOL_IDS) paths.add(`/ferramentas/${tool}`);
  for (const [tool, subpages] of Object.entries(COPILOTO_TOOL_SUBPAGES)) {
    for (const subpage of subpages) paths.add(`/ferramentas/${tool}/${subpage}`);
  }
  for (const { id } of COPILOTO_CALCULATORS) paths.add(`/ferramentas/calculadoras/${id}`);
  return paths;
}
