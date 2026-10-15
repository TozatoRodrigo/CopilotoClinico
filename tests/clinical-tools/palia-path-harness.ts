import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import * as anyPaliaData from '../any-reference/paliaData';

/**
 * Roda a tela PaliaPath congelada do ANY (tests/any-reference/PaliaPath.tsx)
 * sem React e sem DOM, para o teste diferencial dos cuidados paliativos
 * (CC-329). A conta do conversor de opioides, a soma do PPI, o destaque do
 * ECOG e boa parte do texto moram no JSX, não no `paliaData`; por isso o
 * teste usa a tela como ela é, em vez de reescrever a conta.
 *
 * O arquivo é transpilado como está e executado com um React mínimo:
 * - cada componente da árvore é chamado na renderização, e o estado de cada
 *   `useState` fica guardado pela posição do componente na árvore (como o
 *   React faz), então clicar e digitar mudam o estado e a próxima
 *   renderização mostra o resultado;
 * - os componentes de layout e os comuns do ANY (Card, AlertCard, Collapsible,
 *   Modal…) viram tags com o nome do componente: os filhos são renderizados,
 *   e o `onClick` fica nas props para o teste clicar.
 */

type Props = Record<string, unknown>;
type Component = ((props: Props) => unknown) & { __host?: true };

interface RawElement {
  type: string | Component;
  props: Props;
  children: unknown[];
}

export interface RenderedElement {
  /** Tag HTML, nome do componente comum do ANY ou nome do componente da tela. */
  type: string;
  props: Props;
  children: RenderedNode[];
}

export type RenderedNode = RenderedElement | string | number | boolean | null | undefined;

const MARKER = '// ---- início do arquivo original ----\n';
const FRAGMENT = 'fragment';

function isRawElement(node: unknown): node is RawElement {
  return typeof node === 'object' && node !== null && 'type' in node && 'children' in node;
}

export function isElement(node: RenderedNode): node is RenderedElement {
  return typeof node === 'object' && node !== null;
}

/** Componente do ANY que o teste não precisa executar: vira uma tag com o nome. */
function host(name: string): Component {
  const component: Component = () => null;
  component.__host = true;
  Object.defineProperty(component, 'name', { value: name });
  return component;
}

/** Todas as tags da árvore, em profundidade. */
export function* walk(node: RenderedNode): Generator<RenderedElement> {
  if (!isElement(node)) return;
  yield node;
  for (const child of node.children) yield* walk(child);
}

/** Texto de um nó, juntando os filhos. */
export function textContent(node: RenderedNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isElement(node)) return '';
  return node.children.map(textContent).join('');
}

/** Os textos soltos (cada string do JSX ou do dado), sem juntar irmãos. */
export function* textLeaves(node: RenderedNode): Generator<string> {
  if (typeof node === 'string' || typeof node === 'number') {
    yield String(node);
    return;
  }
  if (!isElement(node)) return;
  // Textos que o ANY passa por prop aos componentes comuns (título do Collapsible, do Modal…).
  for (const prop of ['title', 'subtitle', 'badge', 'placeholder']) {
    const value = node.props[prop];
    if (typeof value === 'string') yield value;
  }
  for (const child of node.children) yield* textLeaves(child);
}

export function className(element: RenderedElement): string {
  const value = element.props.className;
  return typeof value === 'string' ? value : '';
}

export interface PaliaPathHarness {
  /** Árvore atual (renderiza de novo se algum estado mudou). */
  tree(): RenderedNode;
  findAll(predicate: (element: RenderedElement) => boolean): RenderedElement[];
  find(predicate: (element: RenderedElement) => boolean, what: string): RenderedElement;
  click(element: RenderedElement): void;
  /** O `onChange` de um input ou select, com `event.target.value`. */
  change(element: RenderedElement, value: string): void;
}

function loadPaliaPath(): Component {
  const content = readFileSync(join(process.cwd(), 'tests/any-reference/PaliaPath.tsx'), 'utf-8');
  const original = content.split(MARKER)[1];
  if (original === undefined) throw new Error('PaliaPath.tsx sem o marcador da referência');

  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      jsxFactory: '__h',
      jsxFragmentFactory: '__Fragment',
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const modules: Record<string, unknown> = {
    react: hooks,
    '../components/layout/Disclaimer': { Disclaimer: host('Disclaimer') },
    '../components/layout/Header': { Header: host('Header') },
    '../components/layout/Footer': { Footer: host('Footer') },
    '../components/layout/Container': { Container: host('Container') },
    '../components/layout/FABMenu': { FABMenu: host('FABMenu') },
    '../components/common/Card': { Card: host('Card') },
    '../components/common/Button': { Button: host('Button') },
    '../components/common/Collapsible': { Collapsible: host('Collapsible') },
    '../components/common/AlertCard': { AlertCard: host('AlertCard') },
    '../components/common/Modal': { Modal: host('Modal') },
    '../components/common/Toast': { ToastContainer: host('ToastContainer') },
    '../data/paliaData': anyPaliaData,
  };
  const requireModule = (name: string): unknown => {
    if (!(name in modules))
      throw new Error(`PaliaPath importa "${name}", que o harness não conhece`);
    return modules[name];
  };

  const exports: Record<string, unknown> = {};
  const run = new Function('require', 'exports', '__h', '__Fragment', 'window', outputText) as (
    require: (name: string) => unknown,
    exports: Record<string, unknown>,
    h: typeof createElement,
    fragment: string,
    window: { scrollTo: () => void },
  ) => void;
  run(requireModule, exports, createElement, FRAGMENT, { scrollTo: () => undefined });

  const page = exports.default;
  if (typeof page !== 'function') throw new Error('PaliaPath sem export default');
  return page as Component;
}

function createElement(type: RawElement['type'], props: Props | null, ...children: unknown[]) {
  return { type, props: props ?? {}, children: children.flat(Infinity) };
}

// ---------------------------------------------------------------------------
// React mínimo: estado por posição do componente na árvore
// ---------------------------------------------------------------------------

/** Renderizador em uso. A renderização é síncrona, então um ponteiro basta. */
interface Renderer {
  slots: Map<string, unknown[]>;
  key: string;
  index: number;
  dirty: boolean;
}

let active: Renderer | null = null;

const hooks = {
  useState(initial: unknown) {
    const renderer = active;
    if (!renderer) throw new Error('useState fora da renderização');
    const index = renderer.index;
    renderer.index += 1;
    const state = renderer.slots.get(renderer.key) ?? [];
    renderer.slots.set(renderer.key, state);
    if (index >= state.length) {
      state.push(typeof initial === 'function' ? (initial as () => unknown)() : initial);
    }
    const setState = (next: unknown) => {
      const current = state[index];
      state[index] =
        typeof next === 'function' ? (next as (value: unknown) => unknown)(current) : next;
      renderer.dirty = true;
    };
    return [state[index], setState];
  },
  useMemo<T>(factory: () => T): T {
    return factory();
  },
};

function expand(
  renderer: Renderer,
  node: unknown,
  path: string,
  seen: Map<string, number>,
): RenderedNode {
  if (Array.isArray(node)) {
    return {
      type: FRAGMENT,
      props: {},
      children: node.map((child) => expand(renderer, child, path, seen)),
    };
  }
  if (!isRawElement(node)) {
    return node as RenderedNode;
  }
  const { type, props, children } = node;
  if (typeof type === 'function' && !type.__host) {
    // Chave estável: caminho do pai + nome + key do JSX (ou a ordem entre irmãos de mesmo nome).
    const base = `${path}/${type.name}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const key = `${base}#${String(props.key ?? occurrence)}`;
    renderer.key = key;
    renderer.index = 0;
    const output = type({ ...props, children });
    return { type: type.name, props, children: [expand(renderer, output, key, new Map())] };
  }
  const name = typeof type === 'function' ? type.name : type;
  return {
    type: name,
    props,
    children: children.map((child) => expand(renderer, child, path, seen)),
  };
}

let page: Component | null = null;

/** Monta o PaliaPath do zero, com estado próprio (vários podem coexistir). */
export function mountPaliaPath(): PaliaPathHarness {
  page ??= loadPaliaPath();
  const root = page;
  const renderer: Renderer = { slots: new Map(), key: '', index: 0, dirty: true };
  let current: RenderedNode = null;

  const tree = (): RenderedNode => {
    if (renderer.dirty) {
      renderer.dirty = false;
      active = renderer;
      try {
        current = expand(renderer, createElement(root, null), '', new Map());
      } finally {
        active = null;
      }
    }
    return current;
  };

  const findAll = (predicate: (element: RenderedElement) => boolean) =>
    [...walk(tree())].filter(predicate);

  return {
    tree,
    findAll,
    find(predicate, what) {
      const [first] = findAll(predicate);
      if (!first) throw new Error(`Não achei na tela do ANY: ${what}`);
      return first;
    },
    click(element) {
      const onClick = element.props.onClick;
      if (typeof onClick !== 'function') throw new Error(`${element.type} sem onClick`);
      onClick();
    },
    change(element, value) {
      const onChange = element.props.onChange;
      if (typeof onChange !== 'function') throw new Error(`${element.type} sem onChange`);
      onChange({ target: { value } });
    },
  };
}
