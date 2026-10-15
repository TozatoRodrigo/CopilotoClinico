import * as anyCalculations from '../any-reference/calculations';
import {
  createHeadlessReact,
  findAll,
  isElement,
  loadFrozenModule,
  textOf,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';

/**
 * CC-318 — dirige o TepGuide congelado do ANY (tests/any-reference) sem React
 * e sem DOM, como um médico tocando na tela: renderiza, acha o botão pelo
 * texto, chama o `onClick` e aplica os `set` registrados ao estado antes de
 * renderizar de novo.
 *
 * O harness (any-component-harness.ts) devolve só as chamadas a `set`; aqui
 * se guarda o valor de cada `useState` no último render, para aplicar os
 * `set(s => …)` na ordem em que o ANY os chamou (o mesmo que o React faz ao
 * agrupar as atualizações de um clique).
 */

const react = createHeadlessReact();
const seen: unknown[] = [];
const originalUseState = react.module.useState.bind(react.module);
react.module.useState = (initial: unknown) => {
  const pair = originalUseState(initial);
  seen.push(pair[0]);
  return pair;
};

const element = (type: string) => (props: Record<string, unknown>) => {
  const { children, ...rest } = props as { children?: HeadlessNode } & Record<string, unknown>;
  return react.module.createElement(type, rest, children);
};

export const navigations: string[] = [];

const TepGuide = loadFrozenModule('TepGuide.tsx', react, {
  'react-router-dom': { useNavigate: () => (to: string) => navigations.push(to) },
  '../components/layout/Disclaimer': { Disclaimer: () => null },
  '../components/layout/Header': { Header: element('header') },
  '../components/layout/Footer': { Footer: element('footer') },
  '../components/layout/Container': { Container: element('container') },
  '../components/layout/FABMenu': { FABMenu: () => null },
  '../components/common/Card': { Card: element('card') },
  '../components/common/Button': { Button: element('button') },
  '../components/common/Collapsible': { Collapsible: element('collapsible') },
  '../components/common/AlertCard': { AlertCard: element('alertcard') },
  '../components/common/Toggle': { Toggle: element('toggle') },
  '../utils/calculations': anyCalculations,
}).default as () => HeadlessNode;

/**
 * Posição de cada `useState` no TepGuide congelado (a ordem do arquivo; ele
 * não muda, o hash é conferido).
 */
export const TEP_STATE = {
  view: 0,
  panel: 1,
  classPanel: 3,
  classState: 4,
  categoryResult: 5,
  hasModR: 6,
  isPregnant: 7,
  wellsLevel: 8,
  percResult: 9,
  ddimerResult: 10,
  yearsPregResult: 11,
  tromboStage: 12,
  ecoChecked: 14,
  ecoConfirmed: 15,
  inlineWellsChecked: 16,
  inlinePercChecked: 17,
  inlineSpesiChecked: 18,
  inlinePesiChecked: 19,
  inlinePesiAge: 20,
  inlineHestiaChecked: 21,
  inlineDdimerAge: 22,
  inlineDdimerValue: 23,
  inlineYearsChecked: 24,
  inlineYearsDD: 25,
  inlineYearsPregChecked: 26,
  inlineYearsPregDD: 27,
  calcWellsChecked: 28,
  calcPercChecked: 29,
  calcSpesiChecked: 30,
  calcPesiChecked: 31,
  calcPesiAge: 32,
  calcBovaChecked: 33,
  calcHestiaChecked: 34,
  calcDdimerAge: 35,
  calcDdimerValue: 36,
  calcYearsChecked: 37,
  calcYearsDD: 38,
  calcYearsPregChecked: 39,
  calcYearsPregDD: 40,
} as const;

export type TepStateKey = keyof typeof TEP_STATE;

/** Uma sessão do TepGuide: estado próprio, render e clique. */
export class AnyTepSession {
  private state: unknown[] = [];
  private values: unknown[] = [];
  tree: HeadlessNode = null;

  constructor(initial: Partial<Record<TepStateKey, unknown>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.state[TEP_STATE[key as TepStateKey]] = value;
    }
    this.render();
  }

  render(): HeadlessNode {
    seen.length = 0;
    this.tree = react.render(TepGuide, {}, this.state);
    this.values = [...seen];
    return this.tree;
  }

  get(key: TepStateKey): unknown {
    return this.values[TEP_STATE[key]];
  }

  /** Aplica os `set` registrados desde o último render e renderiza de novo. */
  private commit(): void {
    for (const call of react.setCalls) {
      const current = this.values[call.position];
      const next =
        typeof call.value === 'function'
          ? (call.value as (value: unknown) => unknown)(current)
          : call.value;
      this.state[call.position] = next;
      this.values[call.position] = next;
    }
    this.render();
  }

  /** Botões visíveis (os do ANY e os nativos), pelo texto. */
  buttons(): HeadlessElement[] {
    return findAll(this.tree, (node) => node.type === 'button');
  }

  findButton(text: string | RegExp): HeadlessElement | undefined {
    return this.buttons().find((button) => matches(textOf(button), text));
  }

  hasButton(text: string | RegExp): boolean {
    return this.findButton(text) !== undefined;
  }

  click(text: string | RegExp, within: HeadlessNode = this.tree): void {
    const button = findAll(within, (node) => node.type === 'button').find((candidate) =>
      matches(textOf(candidate), text),
    );
    if (!button) throw new Error(`botão "${String(text)}" não está na tela do ANY`);
    clickElement(button);
    this.commit();
  }

  /** Chama um handler qualquer da árvore (ex.: `onChange` de input) e aplica os `set`. */
  fire(handler: unknown, ...args: unknown[]): void {
    if (typeof handler !== 'function') throw new Error('handler ausente');
    react.setCalls.length = 0;
    (handler as (...params: unknown[]) => void)(...args);
    this.commit();
  }
}

function matches(text: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
}

function clickElement(button: HeadlessElement): void {
  const onClick = button.props.onClick;
  if (typeof onClick !== 'function') throw new Error(`botão "${textOf(button)}" sem onClick`);
  react.setCalls.length = 0;
  onClick();
}

/** Bloco recolhível do ANY pelo título (o stub desenha o conteúdo sempre). */
export function collapsible(tree: HeadlessNode, title: string): HeadlessElement {
  const found = findAll(
    tree,
    (node) => node.type === 'collapsible' && node.props.title === title,
  )[0];
  if (!found) throw new Error(`bloco "${title}" ausente`);
  return found;
}

export type AnyColor = 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'neutral';

const COLOR_CLASS: Record<string, AnyColor> = {
  'text-success': 'green',
  'text-warning': 'yellow',
  'text-[#FF9800]': 'orange',
  'text-danger': 'red',
  'text-info': 'blue',
  'text-text-secondary': 'neutral',
};

export interface AnyCalcResult {
  score: string | null;
  text: string;
  color: AnyColor;
}

/** As caixas `CalcResult` do ANY dentro de um nó, em ordem. */
export function calcResults(node: HeadlessNode): AnyCalcResult[] {
  return findAll(
    node,
    (candidate) =>
      typeof candidate.props.className === 'string' &&
      candidate.props.className.startsWith('p-4 rounded-lg text-center mt-3'),
  ).map((box) => {
    const className = box.props.className as string;
    const color = Object.entries(COLOR_CLASS).find(([css]) => className.includes(css))?.[1];
    if (!color) throw new Error(`cor desconhecida: ${className}`);
    const parts = box.children.filter(isElement);
    const hasScore = parts.length === 2;
    return {
      score: hasScore ? textOf(parts[0]) : null,
      text: textOf(parts[hasScore ? 1 : 0]),
      color,
    };
  });
}

export { findAll, isElement, textOf, type HeadlessElement, type HeadlessNode };
