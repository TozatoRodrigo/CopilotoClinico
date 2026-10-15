import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

/**
 * Roda um componente React congelado do ANY (tests/any-reference/*.tsx) sem
 * React e sem DOM, para o teste diferencial (ADR-017).
 *
 * Parte da conta do ANY mora dentro do componente (a faixa do modo, o bolus
 * "Este paciente", a trava da "minha diluição", o nomograma da heparina, a
 * tabela da insulina). Para comparar com o motor sem reescrever a referência,
 * o arquivo é transpilado como está e executado com um React de mentira:
 *
 * - `useState` devolve o valor que o teste escolheu para aquela posição (ou o
 *   inicial) e registra as chamadas ao `set`, sem re-renderizar;
 * - `useEffect` não roda (o teste fixa o estado que o efeito fixaria);
 * - o JSX vira uma árvore de objetos que o teste percorre.
 *
 * A ordem das chamadas a `useState` é a do arquivo congelado. Como ele não
 * muda (o hash é conferido), a posição de cada estado é estável.
 */

export interface HeadlessElement {
  type: string | ((props: Record<string, unknown>) => HeadlessNode);
  props: Record<string, unknown>;
  children: HeadlessNode[];
}

export type HeadlessNode = HeadlessElement | string | number | boolean | null | undefined;

const MARKER = '// ---- início do arquivo original ----\n';
const REFERENCE_DIR = join(process.cwd(), 'tests/any-reference');

export interface StateCall {
  position: number;
  value: unknown;
}

/** React de mentira: hooks controlados pelo teste e JSX como árvore de objetos. */
export function createHeadlessReact() {
  let overrides: readonly unknown[] = [];
  let position = 0;
  const setCalls: StateCall[] = [];

  const createElement = (
    type: HeadlessElement['type'],
    props: Record<string, unknown> | null,
    ...children: HeadlessNode[]
  ): HeadlessElement => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity) as HeadlessNode[],
  });

  const module = {
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
    useEffect() {},
    useCallback<T>(fn: T): T {
      return fn;
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useRef<T>(initial: T) {
      return { current: initial };
    },
    createElement,
    Fragment: 'fragment',
  };

  function renderShallow<P>(
    component: (props: P) => HeadlessNode,
    props: P,
    state: readonly unknown[] = [],
  ): HeadlessNode {
    overrides = state;
    position = 0;
    setCalls.length = 0;
    return component(props);
  }

  return {
    module,
    setCalls,
    /** Chama o componente com o estado indicado por posição (`undefined` = valor inicial). */
    render<P>(component: (props: P) => HeadlessNode, props: P, state: readonly unknown[] = []) {
      return expand(renderShallow(component, props, state));
    },
    /**
     * Como `render`, mas sem executar os componentes-função da árvore: o teste
     * lê as props deles (as calculadoras internas do VmGuide).
     */
    renderShallow,
  };
}

/** Executa os componentes-função (ex.: AlertCard) para a árvore ficar só com tags. */
function expand(node: HeadlessNode): HeadlessNode {
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.type === 'function') {
    return expand(node.type({ ...node.props, children: node.children }));
  }
  return { ...node, children: node.children.map(expand) };
}

export interface LoadFrozenModuleOptions {
  /**
   * Nomes internos do arquivo (não exportados) a expor em `__internals`. A
   * linha é acrescentada depois do código original, que segue intacto.
   */
  expose?: readonly string[];
  /** Globais do navegador que o arquivo usa (`window`, `localStorage`), simulados pelo teste. */
  globals?: Readonly<Record<string, unknown>>;
}

/**
 * Carrega um arquivo congelado e devolve o que ele exporta. `modules` resolve
 * cada `import` do arquivo; import que não estiver ali falha alto. `react` é o
 * React de mentira (o de `createHeadlessReact` ou um próprio do roteiro, com
 * `useReducer`).
 */
export function loadFrozenModule(
  file: string,
  react: { module: object },
  modules: Record<string, unknown>,
  options: LoadFrozenModuleOptions = {},
): Record<string, unknown> {
  const content = readFileSync(join(REFERENCE_DIR, file), 'utf-8');
  const original = content.split(MARKER)[1];
  if (original === undefined) throw new Error(`${file} sem o marcador da referência`);
  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: file,
  });
  const exports: Record<string, unknown> = {};
  const require = (specifier: string): unknown => {
    if (specifier === 'react') return react.module;
    if (specifier in modules) return modules[specifier];
    throw new Error(`${file} importa "${specifier}", que o teste não forneceu`);
  };
  const expose = options.expose
    ? `\nexports.__internals = { ${options.expose.join(', ')} };\n`
    : '';
  const globals = Object.entries(options.globals ?? {});
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- só teste, sobre arquivo congelado
  new Function(
    'exports',
    'require',
    'React',
    ...globals.map(([name]) => name),
    outputText + expose,
  )(exports, require, react.module, ...globals.map(([, value]) => value));
  return exports;
}

export function isElement(node: HeadlessNode): node is HeadlessElement {
  return node !== null && typeof node === 'object';
}

/** Todos os elementos da árvore que passam no filtro, em ordem de documento. */
export function findAll(
  node: HeadlessNode,
  predicate: (element: HeadlessElement) => boolean,
): HeadlessElement[] {
  if (!isElement(node)) return [];
  const own = predicate(node) ? [node] : [];
  return [...own, ...node.children.flatMap((child) => findAll(child, predicate))];
}

/** Texto visível de um nó (sem o `value` dos campos). */
export function textOf(node: HeadlessNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node.children.map(textOf).join('');
}

export function hasClass(element: HeadlessElement, className: string): boolean {
  const value = element.props.className;
  return typeof value === 'string' && value.split(/\s+/).includes(className);
}

/**
 * Valor ao lado de um rótulo nas linhas "rótulo | valor" do ANY (AlertCard):
 * a linha é um elemento com dois filhos, o primeiro com o rótulo.
 */
export function valueNextTo(tree: HeadlessNode, label: string): string | null {
  const row = findAll(
    tree,
    (element) =>
      element.children.filter(isElement).length === 2 &&
      textOf(element.children.filter(isElement)[0]) === label,
  )[0];
  const value = row?.children.filter(isElement)[1];
  return value ? textOf(value) : null;
}
