import * as anyCalculations from '../any-reference/calculations';
import * as anyVmData from '../any-reference/vmData';
import {
  createHeadlessReact,
  isElement,
  loadFrozenModule,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';

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
 * O React de mentira e o carregador são os de any-component-harness.ts; aqui
 * fica só o que é do VmGuide (achar as calculadoras internas e clicar em
 * "Calcular").
 */

export type VmElement = HeadlessElement;
export type VmNode = HeadlessNode;

type Component = (props: Record<string, unknown>) => VmNode;

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
  const react = createHeadlessReact();
  const modules: Record<string, unknown> = {
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
  const exports = loadFrozenModule('VmGuide.tsx', react, modules);

  const page = exports.default as Component | undefined;
  if (!page) throw new Error('VmGuide sem export default');

  const components = new Map<string, Component>();
  for (const element of walk(react.renderShallow(page, {}, []))) {
    const name = componentName(element);
    if (name && typeof element.type === 'function') components.set(name, element.type);
  }

  return {
    calculator(name) {
      const component = components.get(name);
      if (!component) throw new Error(`Calculadora "${name}" não encontrada na página do ANY`);
      return {
        render: (state) => react.renderShallow(component, {}, state),
        calculate(fields) {
          const tree = react.renderShallow(component, {}, fields);
          const button = findAll(tree, 'CalcButton')[0];
          const onClick = button?.props.onClick;
          if (typeof onClick !== 'function') throw new Error(`${name} sem botão Calcular`);
          onClick();
          // O resultado é o último `useState` do componente: a posição logo depois dos campos.
          const call = react.setCalls.find(({ position }) => position === fields.length);
          const stored = call ? call.value : undefined;
          return { stored, tree: react.renderShallow(component, {}, [...fields, stored ?? null]) };
        },
        calls: () => [...react.setCalls],
      };
    },
  };
}
