import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { calcDengueHydration } from '../any-reference/calculations';
import { type AnyElement, type AnyNode, type RawElement } from './any-jsx-runtime';

export type { AnyElement, AnyNode };

/**
 * Roda a página DenguePath congelada do ANY (tests/any-reference) sem React e
 * sem DOM, para o teste diferencial da dengue (CC-325) comparar com o
 * original e não com uma transcrição dele. Nada do arquivo é editado: ele é
 * transpilado como está e executado com dublês:
 *
 * - `react`: `useState` guarda cada estado numa posição (a ordem das chamadas
 *   é a do arquivo congelado, que não muda — o hash é conferido) e o `set`
 *   aplica o valor ou a função, como o React; `useMemo`/`useCallback` só
 *   chamam/devolvem a função. Depois de cada clique a página é desenhada de
 *   novo, então os callbacks da árvore sempre enxergam o estado atual;
 * - JSX vira `{ type, props, children }`; componentes locais (CheckItem,
 *   CalcResult…) são chamados e somem da árvore, os importados (Button,
 *   AlertCard, Collapsible…) ficam como `@Nome`, com título e selo como texto;
 * - peso (`useWeight`), toast, `window`, `navigator.clipboard` e o relógio
 *   (`Date`) são controlados pelo teste.
 */

const SOURCE = join(process.cwd(), 'tests/any-reference/DenguePath.tsx');
const MARKER = '// ---- início do arquivo original ----\n';

/** Constantes e helpers do módulo que o teste lê direto. */
const INTERNALS = [
  'fmtInt',
  'ALARM_LABELS',
  'GRAVITY_LABELS',
  'RISK_LABELS',
  'GRUPO_CONFIG',
  'SCREENS_WITH_WEIGHT',
] as const;

/** Estados do componente, na ordem dos `useState` do arquivo congelado. */
const STATE_SLOTS = [
  'screen',
  'trilhaGrupo',
  'alarmes',
  'gravidade',
  'risco',
  'classResult',
  'classStep2Visible',
  'classStep3Visible',
  'htBasal',
  'htAtual',
  'wppMsg',
  'wppVisible',
] as const;

export type AnyScreen =
  | 'home'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'stepGrupo'
  | 'step5'
  | 'grupos'
  | 'classificação'
  | 'grupoA'
  | 'grupoB'
  | 'grupoC'
  | 'grupoD'
  | 'calculadoras'
  | 'efasd'
  | 'examediff'
  | 'altasegura'
  | 'referências';

export type AnyGroup = 'A' | 'B' | 'C' | 'D';

export interface AnyDengueState {
  screen: AnyScreen;
  trilhaGrupo: AnyGroup | null;
  alarmes: boolean[];
  gravidade: boolean[];
  risco: boolean[];
  classResult: { grupo: AnyGroup; desc: string } | null;
  classStep2Visible: boolean;
  classStep3Visible: boolean;
  htBasal: string;
  htAtual: string;
  wppMsg: string;
  wppVisible: boolean;
}

export interface AnyDengueInternals {
  fmtInt: (n: number | null) => string;
  ALARM_LABELS: readonly string[];
  GRAVITY_LABELS: readonly string[];
  RISK_LABELS: readonly string[];
  GRUPO_CONFIG: Record<AnyGroup, { color: string; label: string; rgba: string }>;
  SCREENS_WITH_WEIGHT: readonly AnyScreen[];
}

type Component = ((props: Record<string, unknown>) => unknown) & { stubName?: string };

interface Runtime {
  slots: unknown[];
  cursor: number;
  initialized: boolean;
  weight: number | null;
  now: Date;
  toasts: { message: string; type: string }[];
  opened: string[];
  clipboard: string | null;
}

let active: Runtime | null = null;

function runtime(): Runtime {
  if (!active) throw new Error('Hook do ANY chamado fora de render()');
  return active;
}

const reactStub = {
  useState(initial: unknown) {
    const rt = runtime();
    const index = rt.cursor;
    rt.cursor += 1;
    if (!rt.initialized) {
      rt.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    }
    const owner = rt;
    const set = (next: unknown) => {
      owner.slots[index] =
        typeof next === 'function'
          ? (next as (current: unknown) => unknown)(owner.slots[index])
          : next;
    };
    return [rt.slots[index], set];
  },
  useCallback<T>(fn: T): T {
    return fn;
  },
  useMemo<T>(factory: () => T): T {
    return factory();
  },
};

const Fragment = Symbol('Fragment');

const React = {
  Fragment,
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
    return { $$any: true, type, props: { ...(props ?? {}), children } } satisfies RawElement;
  },
};

function stub(name: string): Component {
  const component: Component = () => null;
  component.stubName = name;
  return component;
}

/** Módulos que a página importa, trocados por dublês. */
function requireStub(path: string): unknown {
  if (path === 'react') return reactStub;
  if (path === '../utils/calculations') return { calcDengueHydration };
  if (path === '../contexts/WeightContext') {
    return {
      useWeight: () => ({
        weight: runtime().weight,
        setWeight: (value: number | null) => {
          runtime().weight = value;
        },
      }),
    };
  }
  if (path === '../contexts/ToastContext') {
    return {
      useToast: () => ({
        addToast: (message: string, type: string) => runtime().toasts.push({ message, type }),
      }),
    };
  }
  // Componentes de layout e comuns: um dublê por nome exportado.
  return new Proxy({}, { get: (_target, name) => stub(String(name)) });
}

function isRaw(value: unknown): value is RawElement {
  return typeof value === 'object' && value !== null && (value as RawElement).$$any === true;
}

/** Desenha a árvore: chama os componentes locais e deixa os importados como `@Nome`. */
function expand(node: unknown): AnyNode[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(expand);
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (!isRaw(node)) throw new Error(`Nó inesperado na árvore do ANY: ${String(node)}`);
  const { type, props } = node;
  const rawChildren = props.children as unknown[];
  if (type === Fragment) return expand(rawChildren);
  if (typeof type === 'string') {
    return [{ type, props, children: expand(rawChildren) }];
  }
  const component = type as Component;
  if (component.stubName) {
    // Título, selo e rótulo de componente importado também são texto da tela.
    const labels = ['title', 'subtitle', 'badge', 'label']
      .map((key) => props[key])
      .filter((value): value is string => typeof value === 'string');
    return [
      {
        type: `@${component.stubName}`,
        props,
        children: [...labels, ...expand(rawChildren)],
      },
    ];
  }
  const children = rawChildren.length === 1 ? rawChildren[0] : rawChildren;
  return expand(component({ ...props, children }));
}

interface LoadedModule {
  DenguePath: () => unknown;
  internals: AnyDengueInternals;
}

let loaded: LoadedModule | null = null;

function load(): LoadedModule {
  if (loaded) return loaded;
  const content = readFileSync(SOURCE, 'utf-8');
  const original = content.split(MARKER)[1];
  if (original === undefined) throw new Error('DenguePath.tsx sem marcador de início');
  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: 'React.createElement',
      jsxFragmentFactory: 'React.Fragment',
    },
  });
  const code = `${outputText}\nexports.__internals = { ${INTERNALS.join(', ')} };`;
  const module = { exports: {} as Record<string, unknown> };
  // `window`, `navigator` e `Date` são parâmetros: a página enxerga os dublês.
  const factory = new Function(
    'require',
    'module',
    'exports',
    'React',
    'window',
    'navigator',
    'Date',
    code,
  ) as (...args: unknown[]) => void;
  const fakeWindow = {
    scrollTo: () => undefined,
    open: (url: string) => {
      runtime().opened.push(url);
    },
  };
  const fakeNavigator = {
    clipboard: {
      writeText: (text: string) => {
        runtime().clipboard = text;
        return Promise.resolve();
      },
    },
  };
  // `new Date()` sem argumento devolve o relógio do teste; com argumento, o Date de verdade.
  const RealDate = Date;
  const FakeDate = function FakeDate(this: unknown, ...args: unknown[]) {
    if (args.length === 0) return new RealDate(runtime().now.getTime());
    return new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
  } as unknown as DateConstructor;
  factory(requireStub, module, module.exports, React, fakeWindow, fakeNavigator, FakeDate);
  const DenguePath = module.exports.default as () => unknown;
  const internals = module.exports.__internals as AnyDengueInternals;
  loaded = { DenguePath, internals };
  return loaded;
}

export function anyDengueInternals(): AnyDengueInternals {
  return load().internals;
}

/** Texto visível de um nó, com espaços normalizados. */
export function textOf(node: AnyNode | AnyNode[]): string {
  const parts: string[] = [];
  const walk = (current: AnyNode) => {
    if (typeof current === 'string') parts.push(current);
    else current.children.forEach(walk);
  };
  (Array.isArray(node) ? node : [node]).forEach(walk);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Todos os textos da árvore, na ordem. */
export function textsOf(nodes: AnyNode[]): string[] {
  const texts: string[] = [];
  const walk = (current: AnyNode) => {
    if (typeof current === 'string') texts.push(current);
    else current.children.forEach(walk);
  };
  nodes.forEach(walk);
  return texts;
}

export interface Clickable {
  label: string;
  element: AnyElement;
  run: () => void;
}

export interface AnyDenguePage {
  /** Desenha de novo e devolve a árvore atual. */
  render(): AnyNode[];
  state(): AnyDengueState;
  /** Fixa estados direto (ex.: as marcações de um caso), sem passar por clique. */
  setState(partial: Partial<AnyDengueState>): void;
  setWeight(weight: number | null): void;
  setNow(now: Date): void;
  /** Elementos clicáveis da tela atual, com o texto deles. */
  clickables(): Clickable[];
  /** Clica no primeiro elemento cujo texto bate e desenha de novo. */
  click(match: string | RegExp | ((label: string) => boolean)): void;
  texts(): string[];
  toasts(): readonly { message: string; type: string }[];
  opened(): readonly string[];
  clipboard(): string | null;
}

/** Abre uma instância nova da página do ANY (estado inicial, sem peso). */
export function openAnyDengue(): AnyDenguePage {
  const { DenguePath } = load();
  const rt: Runtime = {
    slots: [],
    cursor: 0,
    initialized: false,
    weight: null,
    now: new Date(2026, 9, 15, 14, 5),
    toasts: [],
    opened: [],
    clipboard: null,
  };
  let tree: AnyNode[] = [];

  const render = (): AnyNode[] => {
    active = rt;
    try {
      rt.cursor = 0;
      const output = DenguePath();
      rt.initialized = true;
      tree = expand(output);
      return tree;
    } finally {
      active = null;
    }
  };

  const collectClickables = (): Clickable[] => {
    const found: Clickable[] = [];
    const walk = (node: AnyNode) => {
      if (typeof node === 'string') return;
      const onClick = node.props.onClick;
      if (typeof onClick === 'function') {
        found.push({
          label: textOf(node),
          element: node,
          run: () => {
            active = rt;
            try {
              (onClick as () => void)();
            } finally {
              active = null;
            }
          },
        });
      }
      node.children.forEach(walk);
    };
    tree.forEach(walk);
    return found;
  };

  const state = (): AnyDengueState =>
    Object.fromEntries(
      STATE_SLOTS.map((name, index) => [name, rt.slots[index]]),
    ) as unknown as AnyDengueState;

  render();

  return {
    render,
    state,
    setState(partial) {
      for (const [key, value] of Object.entries(partial)) {
        const index = STATE_SLOTS.indexOf(key as (typeof STATE_SLOTS)[number]);
        if (index < 0) throw new Error(`Estado desconhecido do ANY: ${key}`);
        rt.slots[index] = value;
      }
      render();
    },
    setWeight(weight) {
      rt.weight = weight;
      render();
    },
    setNow(now) {
      rt.now = now;
    },
    clickables: collectClickables,
    click(match) {
      const matches =
        typeof match === 'function'
          ? match
          : typeof match === 'string'
            ? (label: string) => label === match
            : (label: string) => match.test(label);
      const target = collectClickables().find(({ label }) => matches(label));
      if (!target) {
        const labels = collectClickables().map(({ label }) => label);
        throw new Error(
          `Nada clicável com "${String(match)}" na tela ${state().screen}: ${labels.join(' | ')}`,
        );
      }
      target.run();
      render();
    },
    texts: () => textsOf(tree),
    toasts: () => rt.toasts,
    opened: () => rt.opened,
    clipboard: () => rt.clipboard,
  };
}
