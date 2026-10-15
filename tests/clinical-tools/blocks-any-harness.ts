import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

/**
 * Roda a página BlockPath congelada do ANY (tests/any-reference) sem React,
 * para o teste diferencial dos bloqueios comparar o Copiloto com o que a tela
 * do ANY mostra, e não com uma transcrição dela. O arquivo é transpilado como
 * está; só os módulos que ele importa viram dublês:
 *
 * - `react`: `useState` lê e grava num estado do harness, na ordem em que a
 *   página chama (tela, peso da calculadora, peso do LAST, formulário da
 *   evolução, texto gerado, mostra o texto); `useMemo` só chama a função;
 * - `react/jsx-runtime`: cada elemento vira `{ type, props, children }`;
 * - componentes e ícones importados viram marcadores `@Nome`;
 * - `useToast` registra o que a página manda mostrar.
 *
 * Os dados do topo do módulo (topografia, bloqueios, lista e anestésicos) não
 * são exportados pelo ANY; o harness acrescenta uma exportação depois de
 * transpilar, sem tocar no texto original.
 */

const SOURCE = join(process.cwd(), 'tests/any-reference/BlockPath.tsx');
const MARKER = '// ---- início do arquivo original ----\n';
const INTERNALS = ['topography', 'blocks', 'blockList', 'anesthetics'] as const;

/** Ordem das chamadas de `useState` em `BlockPath()`. */
const STATE_SLOTS = [
  'screen',
  'calcWeight',
  'lipidWeight',
  'evoForm',
  'evoText',
  'showEvoResult',
] as const;

export type AnyEvoForm = {
  indicação: string;
  tipo: string;
  lado: string;
  transdutor: string;
  agulha: string;
  técnica: string;
  droga: string;
  volume: string;
  dose: string;
  epi: string;
  interc: string;
  intercDesc: string;
  sensitivo: boolean;
  motor: boolean;
  last: boolean;
  resp: string;
  crm: string;
};

export interface AnyBlockPathState {
  screen: string;
  calcWeight: number;
  lipidWeight: number;
  evoForm: AnyEvoForm;
  evoText: string;
  showEvoResult: boolean;
}

export interface AnyElement {
  /** Tag HTML ('div') ou `@Nome` (componente ou ícone importado). */
  type: string;
  props: Record<string, unknown>;
  children: AnyNode[];
}

export type AnyNode = AnyElement | string;

export interface AnyBlockData {
  id: string;
  name: string;
  region: string;
  volume: string;
  type: string;
  indications: string[];
  contraindications: string[];
  material: string[];
  technique: string[];
  tip?: { title: string; text: string };
  anesthetics: { drug: string; conc: string; vol: string }[];
}

export interface AnyBlockPathInternals {
  topography: { title: string; items: { lesion: string; blockId: string; blockName: string }[] }[];
  blocks: AnyBlockData[];
  blockList: { region: string; items: { id: string; name: string; volume: string }[] }[];
  anesthetics: {
    name: string;
    noEpi: number;
    withEpi: number;
    concentrations: { label: string; factor: number }[];
  }[];
}

interface RawElement {
  $$any: true;
  type: unknown;
  props: Record<string, unknown>;
}

type Stub = (() => null) & { stubName: string };

interface RenderContext {
  state: Partial<AnyBlockPathState>;
  slot: number;
  toasts: { message: string; type: string }[];
}

let active: RenderContext | null = null;

function context(): RenderContext {
  if (!active) throw new Error('Hook do ANY chamado fora de render()');
  return active;
}

const stubs = new Map<string, Stub>();

function stub(name: string): Stub {
  let component = stubs.get(name);
  if (!component) {
    component = Object.assign(() => null, { stubName: name });
    stubs.set(name, component);
  }
  return component;
}

/** Módulo cujos exports são todos marcadores (componentes e ícones). */
function stubModule(): unknown {
  return new Proxy(
    {},
    { get: (_target, name) => (name === '__esModule' ? true : stub(String(name))) },
  );
}

function useState<T>(initial: T): [T, (next: T | ((current: T) => T)) => void] {
  const ctx = context();
  const name = STATE_SLOTS[ctx.slot];
  ctx.slot += 1;
  if (!name) throw new Error('BlockPath chamou useState mais vezes que o harness conhece');
  const state = ctx.state as Record<string, unknown>;
  if (!(name in state)) state[name] = initial;
  const setter = (next: T | ((current: T) => T)) => {
    state[name] = typeof next === 'function' ? (next as (current: T) => T)(state[name] as T) : next;
  };
  return [state[name] as T, setter];
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
      return { useState, useMemo: (compute: () => unknown) => compute() };
    case 'react/jsx-runtime':
      return { jsx, jsxs: jsx, Fragment: FRAGMENT };
    case '../contexts/ToastContext':
      return {
        useToast: () => {
          // O `addToast` roda depois do render (no clique): guarda a lista agora.
          const { toasts } = context();
          return {
            addToast: (message: string, type: string) => toasts.push({ message, type }),
          };
        },
      };
    default:
      if (path.startsWith('../components/') || path === 'lucide-react') return stubModule();
      throw new Error(`BlockPath importou um módulo que o harness não conhece: ${path}`);
  }
}

interface LoadedModule {
  BlockPath: () => unknown;
  internals: AnyBlockPathInternals;
}

let loaded: LoadedModule | null = null;

function load(): LoadedModule {
  if (loaded) return loaded;
  const original = readFileSync(SOURCE, 'utf-8').split(MARKER)[1];
  if (!original) throw new Error('BlockPath.tsx sem o marcador da referência congelada');
  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const code = `${outputText}\nmodule.exports.__internals = { ${INTERNALS.join(', ')} };`;
  const module = { exports: {} as Record<string, unknown> };
  // Só em teste: avalia a referência transpilada com os dublês no lugar dos imports.
  new Function('exports', 'require', 'module', code)(module.exports, fakeRequire, module);
  const BlockPath = module.exports.default;
  if (typeof BlockPath !== 'function') throw new Error('BlockPath.tsx sem export default');
  loaded = {
    BlockPath: BlockPath as () => unknown,
    internals: module.exports.__internals as AnyBlockPathInternals,
  };
  return loaded;
}

/** Dado do topo do BlockPath, como o ANY guarda. */
export function anyBlockPathInternals(): AnyBlockPathInternals {
  return load().internals;
}

function isRaw(value: unknown): value is RawElement {
  return typeof value === 'object' && value !== null && '$$any' in value;
}

/** Filhos como o React desenharia: lista achatada, sem `false`/`null`, número vira texto. */
function normalizeChildren(children: unknown): AnyNode[] {
  if (children === undefined || children === null || typeof children === 'boolean') return [];
  if (Array.isArray(children)) return children.flatMap(normalizeChildren);
  if (typeof children === 'string') return [children];
  if (typeof children === 'number') return [String(children)];
  if (isRaw(children)) return [expand(children)];
  throw new Error(`Filho inesperado na árvore do ANY: ${typeof children}`);
}

function expand(element: RawElement): AnyElement {
  const { type, props } = element;
  const { children, ...rest } = props;
  if (typeof type === 'string') return { type, props: rest, children: normalizeChildren(children) };
  if (typeof type === 'function' && 'stubName' in type) {
    return {
      type: `@${(type as Stub).stubName}`,
      props: rest,
      children: normalizeChildren(children),
    };
  }
  throw new Error('BlockPath usou um componente local que o harness não conhece');
}

/**
 * Uma sessão da tela do ANY: guarda o estado entre renders, como o React, e
 * deixa o teste clicar (chamar `onClick`) e redesenhar.
 */
export class AnyBlockPathSession {
  readonly state: Partial<AnyBlockPathState>;
  readonly toasts: { message: string; type: string }[] = [];

  constructor(initial: Partial<AnyBlockPathState> = {}) {
    this.state = { ...initial };
  }

  render(): AnyElement {
    const { BlockPath } = load();
    active = { state: this.state, slot: 0, toasts: this.toasts };
    try {
      const tree = BlockPath();
      if (!isRaw(tree)) throw new Error('BlockPath não devolveu um elemento');
      if (active.slot !== STATE_SLOTS.length) {
        throw new Error(`BlockPath chamou useState ${active.slot} vezes; o harness espera 6`);
      }
      return expand(tree);
    } finally {
      active = null;
    }
  }
}

export function textOf(node: AnyNode): string {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}

export function findAll(node: AnyNode, match: (element: AnyElement) => boolean): AnyElement[] {
  if (typeof node === 'string') return [];
  const own = match(node) ? [node] : [];
  return [...own, ...node.children.flatMap((child) => findAll(child, match))];
}

export function findOne(node: AnyNode, match: (element: AnyElement) => boolean): AnyElement {
  const [first, ...rest] = findAll(node, match);
  if (!first || rest.length > 0) {
    throw new Error(`Esperava um elemento e achei ${rest.length + (first ? 1 : 0)}`);
  }
  return first;
}

export function click(element: AnyElement): void {
  const onClick = element.props.onClick;
  if (typeof onClick !== 'function') throw new Error(`${element.type} sem onClick`);
  (onClick as () => void)();
}
