import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import * as formatters from '../any-reference/formatters';
import * as ketoCalc from '../any-reference/ketoCalc';
import * as ketoData from '../any-reference/ketoData';

/**
 * Roda as telas congeladas do KetoPath do ANY (tests/any-reference/Keto*.tsx)
 * sem React e sem DOM, para o teste diferencial do roteiro de CAD e EHH
 * (CC-326).
 *
 * Parte da regra do KetoPath mora dentro dos componentes: a faixa ativa do
 * potássio, a trava da insulina, os cartões do ciclo, o espelho mL ↔ mEq do
 * KCl, as linhas da prescrição. Para comparar com o motor sem reescrever a
 * referência, o arquivo é transpilado como está e executado com um React de
 * mentira:
 *
 * - `useState` devolve o valor que o teste escolheu para aquele componente e
 *   aquela posição (ou o inicial) e registra cada chamada do setter;
 * - `useMemo` e `useCallback` executam na hora;
 * - o JSX vira objetos; cada componente-função é chamado e registrado com as
 *   props, e cada elemento HTML fica numa lista com o texto que contém.
 *
 * O arquivo não muda (o hash é conferido). Só se acrescenta, depois dele, uma
 * linha que expõe funções internas (os passos do KetoPath.tsx, que não são
 * exportados) — sem tocar no código original.
 */

const MARKER = '// ---- início do arquivo original ----\n';
const REFERENCE_DIR = join(process.cwd(), 'tests/any-reference');

const FRAGMENT = Symbol('Fragment');

interface Element {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
}

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'type' in node && 'children' in node;
}

export interface HostElement {
  tag: string;
  props: Record<string, unknown>;
  text: string;
}

export interface ComponentCall {
  name: string;
  props: Record<string, unknown>;
  text: string;
}

export interface SetterCall {
  component: string;
  index: number;
  value: unknown;
}

export interface KetoRender {
  text: string;
  elements: HostElement[];
  components: ComponentCall[];
}

// ---- React de mentira ----

let currentComponent = '';
let hookIndex = 0;
let stateOverrides: Record<string, unknown[]> = {};
export const setterCalls: SetterCall[] = [];

const FakeReact = {
  Fragment: FRAGMENT,
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
    return { type, props: props ?? {}, children: children.flat(Infinity) };
  },
};

const fakeReactModule = {
  useState(initial: unknown) {
    const component = currentComponent;
    const index = hookIndex;
    hookIndex += 1;
    const overrides = stateOverrides[component];
    const value =
      overrides && index < overrides.length && overrides[index] !== undefined
        ? overrides[index]
        : typeof initial === 'function'
          ? (initial as () => unknown)()
          : initial;
    return [value, (next: unknown) => setterCalls.push({ component, index, value: next })];
  },
  useMemo(factory: () => unknown) {
    return factory();
  },
  useCallback(callback: unknown) {
    return callback;
  },
};

/** Componentes comuns do ANY viram componentes que só desenham os filhos. */
function stub(name: string) {
  const component = (props: Record<string, unknown>) =>
    FakeReact.createElement(FRAGMENT, null, ...((props.children as unknown[]) ?? []));
  Object.defineProperty(component, 'name', { value: name });
  return component;
}

const STUBS: Record<string, Record<string, unknown>> = {
  react: fakeReactModule,
  '../common/Collapsible': { Collapsible: stub('Collapsible') },
  '../common/AlertCard': { AlertCard: stub('AlertCard') },
  '../components/common/Collapsible': { Collapsible: stub('Collapsible') },
  '../components/common/AlertCard': { AlertCard: stub('AlertCard') },
  '../components/common/Button': { Button: stub('Button') },
  '../components/layout/Disclaimer': { Disclaimer: stub('Disclaimer') },
  '../components/layout/Header': { Header: stub('Header') },
  '../components/layout/Footer': { Footer: stub('Footer') },
  '../components/layout/Container': { Container: stub('Container') },
  '../components/layout/FABMenu': { FABMenu: stub('FABMenu') },
  '../contexts/WeightContext': { useWeight: () => ({ weight: null, setWeight: () => {} }) },
  '../../utils/formatters': formatters,
  '../utils/formatters': formatters,
  '../../utils/ketoCalc': ketoCalc,
  '../utils/ketoCalc': ketoCalc,
  '../../data/ketoData': ketoData,
  '../data/ketoData': ketoData,
};

const loaded = new Map<string, Record<string, unknown>>();

function load(file: string, expose = ''): Record<string, unknown> {
  const cached = loaded.get(file);
  if (cached) return cached;
  const content = readFileSync(join(REFERENCE_DIR, file), 'utf-8');
  const original = content.split(MARKER)[1];
  if (original === undefined) throw new Error(`${file} sem marcador`);
  const { outputText } = ts.transpileModule(original, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
  });
  const module = { exports: {} as Record<string, unknown> };
  const requireStub = (path: string) => {
    if (path in STUBS) return STUBS[path];
    if (path === './KetoManejo' || path === '../components/clinical/KetoManejo') {
      return load('KetoManejo.tsx');
    }
    if (path === '../components/clinical/KetoCiclo') return load('KetoCiclo.tsx');
    if (path === '../components/clinical/KetoConsulta') return load('KetoConsulta.tsx');
    if (path === '../components/clinical/KetoPlanilha') return load('KetoPlanilha.tsx');
    throw new Error(`${file} importa ${path}, que o harness não conhece`);
  };
  new Function('require', 'module', 'exports', 'React', outputText + expose)(
    requireStub,
    module,
    module.exports,
    FakeReact,
  );
  loaded.set(file, module.exports);
  return module.exports;
}

// ---- Render ----

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'td',
  'th',
  'tr',
  'label',
  'button',
  'h1',
  'h2',
  'h3',
  'ol',
  'ul',
  'table',
  'thead',
  'tbody',
]);

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function walk(node: unknown, out: KetoRender): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => walk(child, out)).join('');
  if (!isElement(node)) return '';
  const { type, props, children } = node;
  if (type === FRAGMENT) return children.map((child) => walk(child, out)).join('');
  if (typeof type === 'function') {
    const previous = { component: currentComponent, index: hookIndex };
    currentComponent = type.name;
    hookIndex = 0;
    const rendered = (type as (props: Record<string, unknown>) => unknown)({
      ...props,
      children,
    });
    currentComponent = previous.component;
    hookIndex = previous.index;
    const call: ComponentCall = { name: type.name, props, text: '' };
    out.components.push(call);
    call.text = normalize(walk(rendered, out));
    return ` ${call.text} `;
  }
  if (type === 'br') return ' ';
  if (typeof type === 'string') {
    const element: HostElement = { tag: type, props, text: '' };
    out.elements.push(element);
    element.text = normalize(children.map((child) => walk(child, out)).join(''));
    return BLOCK_TAGS.has(type) ? ` ${element.text} ` : element.text;
  }
  return '';
}

/**
 * Desenha um componente do KetoPath com as props dadas. `state` escolhe o
 * valor de cada `useState`, por componente e na ordem de chamada (ex.:
 * `{ CalculadoraKcl: ['19.1', 'central', '15'] }`).
 */
export function renderKeto(
  component: (props: Record<string, unknown>) => unknown,
  props: Record<string, unknown>,
  state: Record<string, unknown[]> = {},
): KetoRender {
  stateOverrides = state;
  setterCalls.length = 0;
  const out: KetoRender = { text: '', elements: [], components: [] };
  out.text = normalize(walk(FakeReact.createElement(component, props), out));
  stateOverrides = {};
  return out;
}

/** Cartões de alerta desenhados, com tipo, título e texto. */
export function alertCards(render: KetoRender): { type: string; title: string; text: string }[] {
  return render.components
    .filter(({ name }) => name === 'AlertCard')
    .map(({ props, text }) => ({
      type: String(props.type),
      title: String(props.title),
      text,
    }));
}

type Component = (props: Record<string, unknown>) => unknown;

export const KetoManejo = load('KetoManejo.tsx') as Record<
  'PassoFluidos' | 'PassoPotassio' | 'PassoInsulina' | 'PassoAdjuvantes',
  Component
> & { semFonte: (text: string) => string };

export const KetoCiclo = load('KetoCiclo.tsx') as Record<'KetoCiclo', Component>;

export const KetoConsulta = load('KetoConsulta.tsx') as Record<
  'TelaCalculadoras' | 'TelaReconhecimento' | 'TelaPrecipitante',
  Component
>;

const KETO_PATH_EXPOSE =
  '\nexports.__internals = { PassoClassificacao, PassoReconhecer, PassoConfirmar, FASE1, FASE2, CARDS, TITULOS };\n';

export const KetoPathInternals = (
  load('KetoPath.tsx', KETO_PATH_EXPOSE) as {
    __internals: {
      PassoClassificacao: Component;
      PassoReconhecer: Component;
      PassoConfirmar: Component;
      FASE1: readonly { id: string; n: number; titulo: string; sub: string }[];
      FASE2: readonly { id: string; n: number; titulo: string; sub: string }[];
      CARDS: readonly { id: string; titulo: string; sub: string; destaque?: boolean }[];
      TITULOS: Record<string, string>;
    };
  }
).__internals;

export const KetoPlanilha = load('KetoPlanilha.tsx') as Record<'KetoPlanilha', Component>;
