import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import * as anyCalculations from '../any-reference/calculations';
import * as anyVmData from '../any-reference/vmData';

/**
 * Roda a página VmGuide congelada do ANY (tests/any-reference/VmGuide.tsx)
 * sem React e sem DOM, para o teste diferencial da ventilação (CC-327).
 *
 * Os 18 avisos de faixa e a formatação do resultado moram no JSX das
 * calculadoras internas da página, não no vmData. Para comparar com o motor
 * sem reescrever a referência, o arquivo é transpilado como está e executado
 * com um React de mentira:
 *
 * - `useState` devolve o texto que o teste escolheu para aquela posição (ou o
 *   inicial) e guarda a última chamada ao `set`, sem re-renderizar;
 * - `useMemo`/`useCallback`/`useRef` só devolvem o valor;
 * - o JSX vira uma árvore de objetos que o teste percorre, sem executar os
 *   componentes filhos (o teste lê as props de `CalcInput` e `ResultBox`).
 *
 * A ordem das chamadas a `useState` é a do arquivo congelado; como o hash é
 * conferido, a posição de cada estado é estável.
 *
 * O AnyComponentHarness do TEP (CC-318) faz o mesmo para outras páginas; ao
 * juntar as branches, este pode passar a usar aquele.
 */

export interface VmElement {
  type: string | ((props: Record<string, unknown>) => VmNode);
  props: Record<string, unknown>;
  children: VmNode[];
}

export type VmNode = VmElement | string | number | boolean | null | undefined;

type Component = (props: Record<string, unknown>) => VmNode;

const MARKER = '// ---- início do arquivo original ----\n';
const FRAGMENT = 'fragment';

function isElement(node: VmNode): node is VmElement {
  return typeof node === 'object' && node !== null;
}

/** Todas as tags da árvore, em profundidade, sem executar componentes. */
export function* walk(node: VmNode): Generator<VmElement> {
  if (!isElement(node)) return;
  yield node;
  for (const child of node.children) yield* walk(child);
  const propChildren = node.props.children;
  if (Array.isArray(propChildren)) {
    for (const child of propChildren as VmNode[]) yield* walk(child);
  } else if (isElement(propChildren as VmNode)) {
    yield* walk(propChildren as VmNode);
  }
}

export function componentName(element: VmElement): string | null {
  return typeof element.type === 'function' ? element.type.name : null;
}

export function findAll(tree: VmNode, name: string): VmElement[] {
  return [...walk(tree)].filter((element) => componentName(element) === name);
}

/** Texto de um nó, juntando os filhos (sem executar componentes). */
export function textContent(node: VmNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isElement(node)) return '';
  return node.children.map(textContent).join('');
}

/** O elemento cujo texto começa com `prefix` (ex.: o botão "Salvar e reavaliar depois"). */
export function findByText(tree: VmNode, prefix: string): VmElement | undefined {
  return [...walk(tree)].find((element) => textContent(element).startsWith(prefix));
}

/** Uma calculadora interna da página, pronta para receber o estado. */
export interface VmCalculatorHarness {
  /**
   * Renderiza com os textos dos campos (na ordem dos `useState` do ANY) e,
   * se houver, o resultado guardado. Devolve a árvore sem executar os filhos.
   */
  render(state: readonly unknown[]): VmNode;
  /**
   * Faz o que o botão "Calcular" do ANY faz: roda o `calc()` com os campos
   * dados e devolve o que ele guardou no estado de resultado (`null` quando o
   * ANY recusou a conta), já re-renderizado para ler a caixa de resultado.
   */
  calculate(fields: readonly string[]): { stored: unknown; tree: VmNode };
  /** Chamadas a `set` desde o último `render` (para clicar e ler o que o ANY guardou). */
  calls(): readonly { position: number; value: unknown }[];
}

export interface VmGuideHarness {
  calculator(name: string): VmCalculatorHarness;
}

function createHeadlessReact() {
  let overrides: readonly unknown[] = [];
  let position = 0;
  const setCalls: { position: number; value: unknown }[] = [];

  const createElement = (
    type: VmElement['type'],
    props: Record<string, unknown> | null,
    ...children: VmNode[]
  ): VmElement => ({
    type,
    props: props ?? {},
    children: (children as unknown[]).flat(Infinity) as VmNode[],
  });

  const hooks = {
    useState(initial: unknown) {
      const current = position;
      position += 1;
      const override = overrides[current];
      const value =
        override !== undefined
          ? override
          : typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial;
      return [value, (next: unknown) => setCalls.push({ position: current, value: next })];
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useCallback<T>(fn: T): T {
      return fn;
    },
    useRef<T>(initial: T) {
      return { current: initial };
    },
  };

  function render(component: Component, state: readonly unknown[]): VmNode {
    overrides = state;
    position = 0;
    setCalls.length = 0;
    return component({});
  }

  return { createElement, hooks, setCalls, render };
}

/** Componente de layout do ANY que o teste não lê: vira uma tag com o nome. */
function stub(name: string): Component {
  const component = (props: Record<string, unknown>) => ({
    type: name,
    props,
    children: [],
  });
  Object.defineProperty(component, 'name', { value: name });
  return component;
}

/**
 * Carrega a página congelada e localiza as calculadoras internas pela árvore
 * da página (elas não são exportadas).
 */
export function loadVmGuide(): VmGuideHarness {
  const content = readFileSync(join(process.cwd(), 'tests/any-reference/VmGuide.tsx'), 'utf-8');
  const original = content.split(MARKER)[1];
  if (original === undefined) throw new Error('VmGuide.tsx sem o marcador da referência');

  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      jsxFactory: '__h',
      jsxFragmentFactory: '__Fragment',
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const react = createHeadlessReact();
  const modules: Record<string, unknown> = {
    react: react.hooks,
    'react-router-dom': { useNavigate: () => () => undefined },
    '../components/layout/Disclaimer': { Disclaimer: stub('Disclaimer') },
    '../components/layout/Header': { Header: stub('Header') },
    '../components/layout/Footer': { Footer: stub('Footer') },
    '../components/layout/Container': { Container: stub('Container') },
    '../components/layout/FABMenu': { FABMenu: stub('FABMenu') },
    '../components/common/Collapsible': { Collapsible: stub('Collapsible') },
    '../components/common/Toast': { ToastContainer: stub('ToastContainer') },
    '../utils/calculations': anyCalculations,
    '../data/vmData': anyVmData,
  };
  const requireModule = (name: string): unknown => {
    if (!(name in modules)) throw new Error(`VmGuide importa "${name}", que o harness não conhece`);
    return modules[name];
  };

  const exports: Record<string, unknown> = {};
  const run = new Function('require', 'exports', '__h', '__Fragment', outputText) as (
    require: (name: string) => unknown,
    exports: Record<string, unknown>,
    h: typeof react.createElement,
    fragment: string,
  ) => void;
  run(requireModule, exports, react.createElement, FRAGMENT);

  const page = exports.default as Component | undefined;
  if (!page) throw new Error('VmGuide sem export default');

  const components = new Map<string, Component>();
  for (const element of walk(react.render(page, []))) {
    const name = componentName(element);
    if (name && typeof element.type === 'function') components.set(name, element.type);
  }

  return {
    calculator(name) {
      const component = components.get(name);
      if (!component) throw new Error(`Calculadora "${name}" não encontrada na página do ANY`);
      return {
        render: (state) => react.render(component, state),
        calculate(fields) {
          const tree = react.render(component, fields);
          const button = findAll(tree, 'CalcButton')[0];
          const onClick = button?.props.onClick;
          if (typeof onClick !== 'function') throw new Error(`${name} sem botão Calcular`);
          onClick();
          // O resultado é o último `useState` do componente: a posição logo depois dos campos.
          const call = react.setCalls.find(({ position }) => position === fields.length);
          const stored = call ? call.value : undefined;
          return { stored, tree: react.render(component, [...fields, stored ?? null]) };
        },
        calls: () => [...react.setCalls],
      };
    },
  };
}
