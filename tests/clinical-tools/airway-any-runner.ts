import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

/**
 * Roda a página AirwayGuide congelada do ANY (tests/any-reference) sem React,
 * para o teste diferencial da via aérea comparar com o original e não com uma
 * transcrição dele. Nada do arquivo é editado: ele é transpilado como está, e
 * os módulos que importa viram dublês:
 *
 * - `react`: `useReducer` guarda o estado aqui e aplica o reducer do próprio
 *   ANY; `useMemo`/`useCallback` só chamam a função; `useState` devolve o
 *   valor inicial (só o `SimpleCheckItem` usa, para o check local);
 * - `react/jsx-runtime`: cada elemento vira `{ type, props }`;
 * - componentes importados (Card, Button, AlertCard…): marcadores com nome;
 * - contextos de peso e de toast e o `navigate`: registram o que recebem.
 *
 * O `render()` devolve a árvore já expandida: os componentes locais da página
 * (DoseCard, CheckItem, SimpleCheckItem, MnemonicDisplay) são chamados e
 * ficam na árvore como `#Nome`, com as props originais; os importados ficam
 * como `@Nome`.
 */

const SOURCE = join(process.cwd(), 'tests/any-reference/AirwayGuide.tsx');
const MARKER = '// ---- início do arquivo original ----\n';

/** Componentes locais e constantes do módulo que o teste lê direto. */
const INTERNALS = [
  'airwayReducer',
  'initialState',
  'calcDose',
  'calcDoseDecimal',
  'calcVolume',
  'getTubeSize',
  'getDEGSize',
  'getTLSize',
  'DRUGS',
  'INDICATION_ITEMS',
  'CRASH_ITEMS',
  'LEMON_ITEMS',
  'ROMAN_ITEMS',
  'CHECKLIST_PACIENTE',
  'CHECKLIST_EQUIP',
  'CHECKLIST_EQUIPE',
  'CHECKLIST_POS',
  'PATHWAY_STEPS',
] as const;

export interface AnyElement {
  /** Tag HTML ('div'), `@Nome` (componente importado) ou `#Nome` (componente local). */
  type: string;
  props: Record<string, unknown>;
  children: AnyNode[];
}

export type AnyNode = AnyElement | string;

export type AnyState = Record<string, unknown> & {
  crash: Record<'C' | 'R' | 'A' | 'S' | 'H', boolean>;
  meds: Record<string, boolean>;
  shockIndex: number | null;
  intubationSuccess: boolean | null;
  rescueMethod: string | null;
  showPlanC: boolean;
};

export type AnyAction = { type: string } & Record<string, unknown>;

interface AnyDrug {
  id: string;
  name: string;
  presentation: string;
  concentration: number;
  unit: string;
  rateUnit: string;
  min: number;
  max: number;
  step: number;
  defaultVal: number;
  category: string;
  alert?: string;
}

export interface AnyAirwayInternals {
  airwayReducer: (state: AnyState, action: AnyAction) => AnyState;
  initialState: AnyState;
  calcDose: (weight: number, rate: number) => number;
  calcDoseDecimal: (weight: number, rate: number) => number;
  calcVolume: (dose: number, concentration: number) => string;
  getTubeSize: (sex: 'M' | 'F' | null) => string;
  getDEGSize: (weight: number) => string;
  getTLSize: (height: number) => string;
  DRUGS: AnyDrug[];
  INDICATION_ITEMS: readonly { title: string; desc: string }[];
  CRASH_ITEMS: readonly { letter: string; title: string; desc: string; recs: readonly string[] }[];
  LEMON_ITEMS: readonly { title: string; desc: string }[];
  ROMAN_ITEMS: readonly { title: string; desc: string }[];
  CHECKLIST_PACIENTE: readonly { title: string }[];
  CHECKLIST_EQUIP: readonly { title: string }[];
  CHECKLIST_EQUIPE: readonly { title: string }[];
  CHECKLIST_POS: readonly { title: string }[];
  PATHWAY_STEPS: readonly { number: number; title: string }[];
}

type RawElement = { $$any: true; type: unknown; props: Record<string, unknown> };
type Component = ((props: Record<string, unknown>) => unknown) & { stubName?: string };

interface Hooks {
  state: AnyState;
  reducer: ((state: AnyState, action: AnyAction) => AnyState) | null;
  globalWeight: number | null;
  toasts: { message: string; type: string }[];
  navigations: string[];
  clipboard: string | null;
}

let active: Hooks | null = null;

function hooks(): Hooks {
  if (!active) throw new Error('Hook do ANY chamado fora de render()');
  return active;
}

function dispatch(action: AnyAction): void {
  const current = hooks();
  if (!current.reducer) throw new Error('dispatch antes do useReducer');
  current.state = current.reducer(current.state, action);
}

const stubs = new Map<string, Component>();

function stub(name: string): Component {
  let component = stubs.get(name);
  if (!component) {
    component = Object.assign(() => null, { stubName: name });
    stubs.set(name, component);
  }
  return component;
}

const jsx = (type: unknown, props: Record<string, unknown>): RawElement => ({
  $$any: true,
  type,
  props: props ?? {},
});

const FRAGMENT = stub('Fragment');

function fakeRequire(path: string): unknown {
  switch (path) {
    case 'react':
      return {
        useReducer: (reducer: Hooks['reducer']) => {
          const current = hooks();
          current.reducer = reducer;
          return [current.state, dispatch];
        },
        useMemo: (factory: () => unknown) => factory(),
        useCallback: (callback: unknown) => callback,
        useState: (initial: unknown) => [
          typeof initial === 'function' ? (initial as () => unknown)() : initial,
          () => undefined,
        ],
      };
    case 'react/jsx-runtime':
      return { jsx, jsxs: jsx, Fragment: FRAGMENT };
    case 'react-router-dom':
      return { useNavigate: () => (to: string) => hooks().navigations.push(to) };
    case '../contexts/WeightContext':
      return { useWeight: () => ({ weight: hooks().globalWeight, setWeight: () => undefined }) };
    case '../contexts/ToastContext':
      return {
        useToast: () => ({
          addToast: (message: string, type = 'info') => hooks().toasts.push({ message, type }),
        }),
      };
    default:
      // Componentes de layout e comuns: um marcador por nome exportado.
      return new Proxy({}, { get: (_target, name) => stub(String(name)) });
  }
}

interface LoadedModule {
  AirwayGuide: () => unknown;
  internals: AnyAirwayInternals;
}

let loaded: LoadedModule | null = null;

function load(): LoadedModule {
  if (loaded) return loaded;
  const [, original] = readFileSync(SOURCE, 'utf-8').split(MARKER);
  if (!original) throw new Error('AirwayGuide.tsx sem o marcador do original');
  const { outputText } = ts.transpileModule(original, {
    fileName: 'AirwayGuide.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  // Expõe as declarações do módulo sem tocar no original: o trecho é
  // acrescentado ao código já transpilado, no mesmo escopo.
  const code = `${outputText}\nmodule.exports.__internals = { ${INTERNALS.join(', ')} };`;
  const module = { exports: {} as Record<string, unknown> };
  const window = { scrollTo: () => undefined };
  const navigator = {
    clipboard: {
      writeText: (text: string) => {
        hooks().clipboard = text;
        // `.then` síncrono: o toast de "copiado" é registrado na hora.
        return { then: (callback: () => void) => callback() };
      },
    },
  };
  new Function('require', 'module', 'exports', 'window', 'navigator', code)(
    fakeRequire,
    module,
    module.exports,
    window,
    navigator,
  );
  loaded = {
    AirwayGuide: module.exports.default as () => unknown,
    internals: module.exports.__internals as AnyAirwayInternals,
  };
  return loaded;
}

export function anyAirwayInternals(): AnyAirwayInternals {
  return load().internals;
}

function isRaw(node: unknown): node is RawElement {
  return typeof node === 'object' && node !== null && '$$any' in node;
}

function expand(node: unknown): AnyNode[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!isRaw(node)) return [];
  const { type, props } = node;
  if (typeof type === 'string') {
    return [{ type, props, children: expand(props.children) }];
  }
  const component = type as Component;
  if (component === FRAGMENT) return expand(props.children);
  if (component.stubName) {
    // Modal fechado não aparece na tela.
    if (component.stubName === 'Modal' && !props.open) return [];
    return [{ type: `@${component.stubName}`, props, children: expand(props.children) }];
  }
  return [{ type: `#${component.name}`, props, children: expand(component(props)) }];
}

export function textOf(node: AnyNode | readonly AnyNode[]): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map((child) => textOf(child as AnyNode)).join('');
  const element = node as AnyElement;
  const title = typeof element.props.title === 'string' ? `${element.props.title} ` : '';
  return title + textOf(element.children);
}

export function findAll(
  node: AnyNode | readonly AnyNode[],
  predicate: (element: AnyElement) => boolean,
): AnyElement[] {
  if (typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child as AnyNode, predicate));
  const element = node as AnyElement;
  return [...(predicate(element) ? [element] : []), ...findAll(element.children, predicate)];
}

const EVENT = { stopPropagation: () => undefined, preventDefault: () => undefined };

/** Uma sessão da página do ANY: estado, toasts, navegação e área de transferência. */
export class AnyAirwaySession {
  private readonly hooks: Hooks;

  constructor(options: { globalWeight?: number | null } = {}) {
    const { internals } = load();
    this.hooks = {
      state: internals.initialState,
      reducer: internals.airwayReducer,
      globalWeight: options.globalWeight ?? null,
      toasts: [],
      navigations: [],
      clipboard: null,
    };
  }

  get state(): AnyState {
    return this.hooks.state;
  }

  get toasts(): readonly { message: string; type: string }[] {
    return this.hooks.toasts;
  }

  get clipboard(): string | null {
    return this.hooks.clipboard;
  }

  dispatch(action: AnyAction): void {
    this.withHooks(() => dispatch(action));
  }

  /** Abre o roteiro num passo (o que o StepperNav do ANY faz). */
  goToStep(step: number): void {
    this.dispatch({ type: 'SET_SCREEN', screen: 'pathway' });
    this.dispatch({ type: 'SET_STEP', step });
  }

  render(): AnyNode[] {
    return this.withHooks(() => expand(load().AirwayGuide()));
  }

  /** Clica no primeiro botão (HTML ou `Button`) cujo texto é exatamente `text`. */
  click(text: string): void {
    const button = this.buttons().find((element) => textOf(element).trim() === text);
    if (!button) throw new Error(`Botão "${text}" não está na tela do ANY`);
    this.withHooks(() => (button.props.onClick as (event: unknown) => void)(EVENT));
  }

  /** Chama um handler da árvore (ex.: o `onToggle` de um `#DoseCard`). */
  invoke(element: AnyElement, handler: string, ...args: unknown[]): void {
    const callback = element.props[handler];
    if (typeof callback !== 'function') throw new Error(`${element.type} sem ${handler}`);
    this.withHooks(() => (callback as (...values: unknown[]) => void)(...args));
  }

  /** Textos dos botões visíveis; `type` restringe a `<button>` ou ao `Button` do ANY. */
  buttonLabels(type?: 'button' | '@Button'): string[] {
    return this.buttons()
      .filter((element) => !type || element.type === type)
      .map((element) => textOf(element).trim());
  }

  /** Digita num campo pelo rótulo (o `<label>` irmão do `<input>`). */
  type(label: string, value: string): void {
    const input = this.inputByLabel(label);
    this.withHooks(() => (input.props.onChange as (event: unknown) => void)({ target: { value } }));
  }

  /** Bloco do campo (rótulo, input e aviso abaixo dele). */
  fieldBlock(label: string): AnyElement {
    const block = findAll(this.render(), (element) =>
      element.children.some(
        (child) => typeof child !== 'string' && child.type === 'label' && textOf(child) === label,
      ),
    )[0];
    if (!block) throw new Error(`Campo "${label}" não está na tela do ANY`);
    return block;
  }

  private inputByLabel(label: string): AnyElement {
    const input = findAll(this.fieldBlock(label), (element) => element.type === 'input')[0];
    if (!input) throw new Error(`Campo "${label}" sem input`);
    return input;
  }

  private buttons(): AnyElement[] {
    return findAll(
      this.render(),
      (element) =>
        (element.type === 'button' || element.type === '@Button') &&
        typeof element.props.onClick === 'function',
    );
  }

  private withHooks<T>(run: () => T): T {
    const previous = active;
    active = this.hooks;
    try {
      return run();
    } finally {
      active = previous;
    }
  }
}
