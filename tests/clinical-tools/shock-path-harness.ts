import * as calculations from '../any-reference/calculations';
import {
  findAll,
  isElement,
  loadFrozenModule,
  textOf,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';

export { findAll, isElement, textOf, type HeadlessElement, type HeadlessNode };

/**
 * Roda o ShockPath congelado do ANY (tests/any-reference/ShockPath.tsx) sem
 * React e sem DOM, para o teste diferencial do choque (CC-316, CC-317).
 *
 * Quase toda a regra do ANY mora dentro do componente: o reducer, o perfil
 * (`useMemo`), os textos de conduta, os ramos do VTI no JSX. Para comparar
 * com o motor sem reescrever a referência, o arquivo é transpilado como está
 * e executado com um React de mentira:
 *
 * - `useReducer` devolve o estado que o teste escolheu e registra cada
 *   `dispatch`, sem re-renderizar;
 * - `useMemo` executa e guarda o resultado na ordem da chamada (o perfil é o
 *   terceiro); `useEffect` não roda;
 * - o JSX vira uma árvore de objetos, e cada componente-função chamado fica
 *   registrado com as props (o título de cada `ResultCard`, por exemplo).
 *
 * O arquivo não muda (o hash é conferido). Só se acrescenta, depois dele, uma
 * linha que expõe as funções internas do módulo (o reducer, o estado inicial,
 * os textos de conduta) — sem tocar no código original.
 */

export interface RenderedComponent {
  name: string;
  props: Record<string, unknown>;
  text: string;
}

export interface ShockPathRender {
  tree: HeadlessNode;
  /** Resultado de cada `useMemo`, na ordem do arquivo. */
  memos: unknown[];
  /** Componentes-função chamados (os do ShockPath e os simulados), com props e texto. */
  components: RenderedComponent[];
  /** Ações despachadas por cliques simulados depois do render. */
  dispatched: { type: string; [key: string]: unknown }[];
  /** Rotas abertas pelo `navigate`. */
  navigated: string[];
}

export type AnyShockState = Record<string, unknown>;

interface Internals {
  shockReducer: (state: AnyShockState, action: unknown) => AnyShockState;
  initialState: AnyShockState;
  getVneriCondutaText: (vneri: number) => string;
  getQuadrantConductText: (id: string) => string;
  QUADRANT_CELLS: { id: string; color: string; title: string; text: string }[];
  TecReavalSection: (props: Record<string, unknown>) => HeadlessNode;
}

const EXPOSE = [
  'shockReducer',
  'initialState',
  'getVneriCondutaText',
  'getQuadrantConductText',
  'QUADRANT_CELLS',
  'TecReavalSection',
];

/** Componentes de layout e comuns do ANY viram elementos com o nome deles. */
const STUBBED_COMPONENTS: Record<string, string[]> = {
  '../components/layout/Disclaimer': ['Disclaimer'],
  '../components/layout/Header': ['Header'],
  '../components/layout/Footer': ['Footer'],
  '../components/layout/Container': ['Container'],
  '../components/layout/FABMenu': ['FABMenu'],
  '../components/common/Card': ['Card'],
  '../components/common/Button': ['Button'],
  '../components/common/Collapsible': ['Collapsible'],
  '../components/common/AlertCard': ['AlertCard'],
  '../components/common/Toggle': ['Toggle'],
};

function asChildren(value: unknown): HeadlessNode[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value.flat(Infinity) : [value]) as HeadlessNode[];
}

function stub(name: string) {
  const component = (props: Record<string, unknown>): HeadlessElement => ({
    type: name,
    props,
    children: asChildren(props.children),
  });
  Object.defineProperty(component, 'name', { value: name });
  return component;
}

const recorder = {
  state: undefined as AnyShockState | undefined,
  memos: [] as unknown[],
  dispatched: [] as ShockPathRender['dispatched'],
  navigated: [] as string[],
  weight: null as number | null,
};

const fakeReact = {
  useReducer(_reducer: unknown, initial: AnyShockState) {
    return [
      recorder.state ?? initial,
      (action: ShockPathRender['dispatched'][number]) => recorder.dispatched.push(action),
    ];
  },
  useMemo<T>(factory: () => T): T {
    const value = factory();
    recorder.memos.push(value);
    return value;
  },
  useCallback<T>(fn: T): T {
    return fn;
  },
  useEffect() {},
  createElement(
    type: HeadlessElement['type'],
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): HeadlessElement {
    return { type, props: props ?? {}, children: children.flat(Infinity) as HeadlessNode[] };
  },
  Fragment: 'fragment',
};

function load(): { ShockPath: () => HeadlessNode; internals: Internals } {
  const modules: Record<string, unknown> = {
    react: fakeReact,
    'react-router-dom': { useNavigate: () => (path: string) => recorder.navigated.push(path) },
    '../contexts/UnitContext': {
      useUnits: () => ({ lactateUnit: 'mmol/L', setLactateUnit: () => {} }),
    },
    '../contexts/WeightContext': {
      useWeight: () => ({ weight: recorder.weight, setWeight: () => {} }),
    },
    '../contexts/ToastContext': { useToast: () => ({ addToast: () => {} }) },
    '../utils/calculations': calculations,
  };
  for (const [specifier, names] of Object.entries(STUBBED_COMPONENTS)) {
    modules[specifier] = Object.fromEntries(names.map((name) => [name, stub(name)]));
  }
  const exports = loadFrozenModule('ShockPath.tsx', { module: fakeReact }, modules, {
    expose: EXPOSE,
    globals: { window: { scrollTo() {} }, localStorage: { setItem() {}, getItem: () => null } },
  });
  return {
    ShockPath: exports.default as () => HeadlessNode,
    internals: exports.__internals as Internals,
  };
}

const loaded = load();

/** Funções internas do ShockPath congelado (reducer, estado inicial, textos). */
export const anyShock: Internals = loaded.internals;

function expand(node: HeadlessNode, components: RenderedComponent[]): HeadlessNode {
  if (!isElement(node)) return node;
  if (typeof node.type === 'function') {
    const props = {
      ...node.props,
      children: node.children.length === 1 ? node.children[0] : node.children,
    };
    const rendered = expand(node.type(props), components);
    components.push({ name: node.type.name, props, text: textOf(rendered) });
    return rendered;
  }
  return { ...node, children: node.children.map((child) => expand(child, components)) };
}

/** Desenha o ShockPath com o estado indicado (o resto vem do estado inicial do ANY). */
export function renderShockPath(
  state: AnyShockState,
  options: { weight?: number | null } = {},
): ShockPathRender {
  recorder.state = { ...anyShock.initialState, ...state };
  recorder.memos = [];
  recorder.dispatched = [];
  recorder.navigated = [];
  recorder.weight = options.weight ?? null;
  const components: RenderedComponent[] = [];
  const tree = expand(loaded.ShockPath(), components);
  return {
    tree,
    memos: recorder.memos,
    components,
    dispatched: recorder.dispatched,
    navigated: recorder.navigated,
  };
}

/** Componentes de um nome (ex.: todos os `ResultCard` visíveis). */
export function componentsNamed(render: ShockPathRender, name: string): RenderedComponent[] {
  return render.components.filter((component) => component.name === name);
}

/** Botão (do ANY ou nativo) cujo texto é exatamente o indicado. */
export function buttonWithText(render: ShockPathRender, text: string): HeadlessElement {
  const button = findAll(
    render.tree,
    (element) =>
      (element.type === 'Button' || element.type === 'button') && textOf(element).trim() === text,
  )[0];
  if (!button) throw new Error(`Botão "${text}" não está na tela`);
  return button;
}

/** Simula o toque: chama o `onClick` e devolve o que foi despachado por ele. */
export function click(
  render: ShockPathRender,
  element: HeadlessElement,
): ShockPathRender['dispatched'] {
  const before = render.dispatched.length;
  const onClick = element.props.onClick;
  if (typeof onClick !== 'function') throw new Error('Elemento sem onClick');
  onClick();
  return render.dispatched.slice(before);
}

/** Aplica as ações despachadas no reducer do ANY. */
export function applyAny(state: AnyShockState, actions: readonly unknown[]): AnyShockState {
  return actions.reduce<AnyShockState>(
    (current, action) => anyShock.shockReducer(current, action),
    {
      ...anyShock.initialState,
      ...state,
    },
  );
}
