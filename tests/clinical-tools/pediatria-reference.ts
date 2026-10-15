import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { fmt } from '../any-reference/formatters';
import {
  createHeadlessReact,
  findAll,
  isElement,
  textOf,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';

/**
 * Executa o PedGuide do ANY v4 a partir da referência congelada
 * (tests/any-reference/PedGuide.tsx), sem editar nada dela (CC-319, CC-320).
 *
 * O conteúdo do PedGuide mora dentro do componente e não é exportado. Este
 * módulo transpila o arquivo inteiro como está e acrescenta, depois do código
 * original, uma linha que expõe as constantes e funções internas. O que é
 * conta de tela (equipamentos, desfibrilação, fluidos, transfusão, vazão
 * exibida) sai renderizando o próprio componente com um React de mentira.
 */

const REFERENCE = join(process.cwd(), 'tests/any-reference/PedGuide.tsx');
const MARKER = '// ---- início do arquivo original ----\n';

export interface AnyBolusResult {
  mg: string;
  ml: string;
  mlLabel?: string;
  unit: string;
}

export interface AnyBolusDrug {
  id: string;
  name: string;
  presentation: string;
  doseBadge: string;
  highlight?: boolean;
  instruction: string;
  calc: (peso: number, ageY?: number | null, ageM?: number | null) => AnyBolusResult;
  needsAge?: boolean;
  prepKey?: string;
  calcAt?: string;
  naoRotineiro?: boolean;
}

export interface AnyDilution {
  drug: number;
  diluent: number;
  conc: number;
  vol: number;
}

export interface AnyInfusion {
  id: string;
  name: string;
  category: 'vasoativos' | 'sedativos' | 'outros';
  unit: string;
  range: [number, number];
  step: number;
  defaultVal: number;
  presentation: string;
  warning?: string;
  dilutions: { small: AnyDilution; medium: AnyDilution; large: AnyDilution };
}

export interface AnyBroselow {
  key: string;
  name: string;
  peso: number;
  idadeMeses: number;
  altura: number;
  tubo: number;
  fixacao: number;
  lâmina: string;
  lma: string;
  bougie: string;
  sondaAsp: number;
  min: number;
  max: number;
}

export interface AnyScenario {
  title: string;
  desc: string;
  highlight: string[];
  sections: string[];
  infusionHighlight: string[];
  checklist?: boolean;
  fluids?: boolean;
}

export interface PedGuideInternals {
  BROSELOW_DATA: AnyBroselow[];
  PCR_DRUGS: AnyBolusDrug[];
  IOT_DRUGS: AnyBolusDrug[];
  EMERGENCY_DRUGS: AnyBolusDrug[];
  CONVULSION_DRUGS: AnyBolusDrug[];
  NEURO_DRUGS: AnyBolusDrug[];
  PAIN_DRUGS: AnyBolusDrug[];
  RESP_DRUGS: AnyBolusDrug[];
  AGE_DRUGS: AnyBolusDrug[];
  TOX_DRUGS: AnyBolusDrug[];
  INFUSION_DATA: Record<string, AnyInfusion>;
  SCENARIO_CONFIGS: Record<string, AnyScenario>;
  PREPARATIONS: Record<string, { title: string; steps: string[] }>;
  IOT_CHECKLIST_ITEMS: { text: string; valueKey: string | null }[];
  CAUSES_6H: string[];
  CAUSES_6T: string[];
  VITAL_ROWS: { label: string; values: string[] }[];
  VITAL_COLS: string[];
  pasMinima: (ageY: number) => number;
  getColorFromWeight: (w: number) => AnyBroselow;
  getWeightCategory: (peso: number) => 'small' | 'medium' | 'large';
  calcInfusionRate: (inf: AnyInfusion, dose: number, peso: number) => number;
  calcDoseFromRate: (inf: AnyInfusion, mlh: number, peso: number) => number;
  formatConc: (conc: number, unit: string) => string;
  formatIdade: (meses: number) => string;
  InfusionCard: (props: { inf: AnyInfusion; peso: number; highlighted: boolean }) => HeadlessNode;
  PedGuide: () => HeadlessNode;
}

const INTERNALS = [
  'BROSELOW_DATA',
  'PCR_DRUGS',
  'IOT_DRUGS',
  'EMERGENCY_DRUGS',
  'CONVULSION_DRUGS',
  'NEURO_DRUGS',
  'PAIN_DRUGS',
  'RESP_DRUGS',
  'AGE_DRUGS',
  'TOX_DRUGS',
  'INFUSION_DATA',
  'SCENARIO_CONFIGS',
  'PREPARATIONS',
  'IOT_CHECKLIST_ITEMS',
  'CAUSES_6H',
  'CAUSES_6T',
  'VITAL_ROWS',
  'VITAL_COLS',
  'pasMinima',
  'getColorFromWeight',
  'getWeightCategory',
  'calcInfusionRate',
  'calcDoseFromRate',
  'formatConc',
  'formatIdade',
  'InfusionCard',
];

/** Componentes do app do ANY que o PedGuide usa: só o que importa para ler a árvore. */
function layoutStubs(react: ReturnType<typeof createHeadlessReact>): Record<string, unknown> {
  const { createElement } = react.module;
  const nothing = () => null;
  const passThrough =
    (tag: string) =>
    ({ children, ...props }: Record<string, unknown>) =>
      createElement(tag, props, ...((children as HeadlessNode[]) ?? []));
  return {
    'lucide-react': { ChevronDown: nothing },
    '../components/layout/Disclaimer': { Disclaimer: nothing },
    '../components/layout/Header': { Header: nothing },
    '../components/layout/Footer': { Footer: nothing },
    '../components/layout/Container': { Container: passThrough('container') },
    '../components/layout/FABMenu': { FABMenu: nothing },
    '../components/common/Collapsible': { Collapsible: passThrough('collapsible') },
    '../components/common/AlertCard': { AlertCard: passThrough('alert-card') },
    '../components/common/Modal': { Modal: nothing },
    '../components/common/Toast': { ToastContainer: nothing },
    '../contexts/ToastContext': { useToast: () => ({}) },
    '../utils/formatters': { fmt },
  };
}

export interface PedGuideReference {
  internals: PedGuideInternals;
  react: ReturnType<typeof createHeadlessReact>;
}

export function loadPedGuide(): PedGuideReference {
  const content = readFileSync(REFERENCE, 'utf-8');
  const original = content.split(MARKER)[1];
  if (original === undefined) throw new Error('PedGuide.tsx sem o marcador da referência');
  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'PedGuide.tsx',
  });
  const react = createHeadlessReact();
  const modules = layoutStubs(react);
  const exportsObject: Record<string, unknown> = {};
  const require = (specifier: string): unknown => {
    if (specifier === 'react') return react.module;
    if (specifier in modules) return modules[specifier];
    throw new Error(`PedGuide.tsx importa "${specifier}", que o teste não forneceu`);
  };
  // Acrescentado depois do código original (que segue intacto): expõe o que
  // o arquivo não exporta, para comparar dado com dado.
  const expose = `\nexports.__internals = { ${INTERNALS.join(', ')} };\n`;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- só teste, sobre arquivo congelado
  new Function('exports', 'require', 'React', outputText + expose)(
    exportsObject,
    require,
    react.module,
  );
  const internals = exportsObject.__internals as Omit<PedGuideInternals, 'PedGuide'>;
  return {
    internals: { ...internals, PedGuide: exportsObject.default as PedGuideInternals['PedGuide'] },
    react,
  };
}

/** Todas as drogas em bolus, na ordem do `ALL_BOLUS_DRUGS` do ANY. */
export function allBolusDrugs(internals: PedGuideInternals): AnyBolusDrug[] {
  return [
    ...internals.PCR_DRUGS,
    ...internals.IOT_DRUGS,
    ...internals.EMERGENCY_DRUGS,
    ...internals.CONVULSION_DRUGS,
    ...internals.NEURO_DRUGS,
    ...internals.PAIN_DRUGS,
    ...internals.RESP_DRUGS,
    ...internals.AGE_DRUGS,
    ...internals.TOX_DRUGS,
  ];
}

/** Posições dos `useState` do PedGuide, na ordem do arquivo congelado. */
export const PEDGUIDE_STATE = {
  pesoRaw: 0,
  idadeRaw: 1,
  alturaRaw: 2,
  selectedBroselow: 3,
  broselowOpen: 4,
  view: 5,
  scenarioKey: 6,
} as const;

export interface PedGuideState {
  pesoRaw?: string;
  idadeRaw?: string;
  alturaRaw?: string;
  selectedBroselow?: AnyBroselow | null;
  view?: 'home' | 'pcr' | 'cenarios' | 'cenario' | 'calculadoras';
  scenarioKey?: string | null;
}

/** Renderiza a tela do PedGuide com o estado pedido e devolve a árvore. */
export function renderPedGuide(reference: PedGuideReference, state: PedGuideState): HeadlessNode {
  const overrides: unknown[] = [];
  for (const [key, position] of Object.entries(PEDGUIDE_STATE)) {
    const value = state[key as keyof PedGuideState];
    if (value !== undefined) overrides[position] = value;
  }
  return reference.react.render(reference.internals.PedGuide, {}, overrides);
}

/**
 * Valor de um bloco "rótulo em cima, número embaixo" do PedGuide: o elemento
 * cujo primeiro filho tem exatamente o rótulo; devolve o texto do segundo.
 */
export function valueUnder(tree: HeadlessNode, label: string): string | null {
  const block = findAll(tree, (element) => {
    const children = element.children.filter(isElement);
    return children.length >= 2 && textOf(children[0]).trim() === label;
  })[0];
  const value = block?.children.filter(isElement)[1];
  return value ? textOf(value).trim() : null;
}

/** Texto de toda a árvore, para procurar frases. */
export function fullText(tree: HeadlessNode): string {
  return textOf(tree);
}

/** O campo de vazão (mL/h) de um `InfusionCard` renderizado. */
export function rateInputValue(tree: HeadlessNode): string {
  const input = findAll(
    tree,
    (element: HeadlessElement) =>
      element.type === 'input' &&
      element.props.type === 'text' &&
      element.props.inputMode === 'decimal',
  )[0];
  if (!input) throw new Error('InfusionCard sem o campo de vazão');
  return String(input.props.value);
}
