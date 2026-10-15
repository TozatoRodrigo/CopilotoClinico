import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { fmt } from '../any-reference/calculations';

/**
 * Roda a página SedaPath congelada do ANY (tests/any-reference) sem React e
 * sem DOM, para o teste diferencial da sedação (CC-328) comparar com o
 * original e não com uma transcrição dele. Nada do arquivo é editado: ele é
 * transpilado como está e executado com dublês:
 *
 * - `react`: o único `useState` da página guarda o estado aqui, e o `set`
 *   aplica o valor ou a função, como o React; `useCallback` devolve a função.
 *   Depois de cada ação a página é desenhada de novo, então os callbacks da
 *   árvore sempre enxergam o estado atual;
 * - JSX vira `{ type, props, children }`. As telas e os componentes locais
 *   (ScreenKetofol, OptionCard, MedOption, ResultRow…) são chamados e ficam na
 *   árvore como `#Nome`, com as props originais; os importados (Button,
 *   AlertCard, Collapsible, Toggle…) ficam como `@Nome`;
 * - `fmt` vem da cópia congelada de `calculations.ts`; peso global, toast,
 *   `navigate` e `window.scrollTo` são dublês que só registram.
 */

const SOURCE = join(process.cwd(), 'tests/any-reference/SedaPath.tsx');
const MARKER = '// ---- início do arquivo original ----\n';

/** Constantes do módulo que o teste lê direto. */
const INTERNALS = ['INITIAL_STATE', 'BREADCRUMB_LABELS'] as const;

export type AnyScreen =
  | 'triagem'
  | 'colaborativo'
  | 'sem-sedação'
  | 'sedação-vo'
  | 'pouco-colaborativo'
  | 'urgencia-alta-pc'
  | 'escolha-im-urgente'
  | 'urgencia-baixa'
  | 'nao-colaborativo'
  | 'preparo-iv'
  | 'ketofol'
  | 'durante'
  | 'pos';

export type AnyProtocol = 'ketamina' | 'midazolam' | 'mida-hf' | null;

/** O `SedaState` do ANY, com os nomes de lá. */
export interface AnySedaState {
  screen: AnyScreen;
  history: AnyScreen[];
  triagem: string | null;
  sedaçãoPrevia: boolean;
  sedaçãoPreviaVO: boolean;
  sedaçãoPreviaPc: boolean;
  medUrgente: AnyProtocol;
  medCombativo: AnyProtocol;
  redflags: Record<string, boolean>;
  materialChecks: Record<string, boolean>;
  equipeChecks: Record<string, boolean>;
  posImChecks: Record<string, boolean>;
  posCombativoChecks: Record<string, boolean>;
  urgBaixaChecks: Record<string, boolean>;
  altaChecks: Record<string, boolean>;
  contençãoChecks: Record<string, boolean>;
  pesoKetUrg: string;
  pesoKetComb: string;
  pesoKetofol: string;
}

export interface AnySedaInternals {
  INITIAL_STATE: AnySedaState;
  BREADCRUMB_LABELS: Record<AnyScreen, string>;
}

export interface AnyElement {
  /** Tag HTML ('div'), `@Nome` (componente importado) ou `#Nome` (componente local). */
  type: string;
  props: Record<string, unknown>;
  children: AnyNode[];
}

export type AnyNode = AnyElement | string;

type RawElement = { $$any: true; type: unknown; props: Record<string, unknown> };
type Component = ((props: Record<string, unknown>) => unknown) & { stubName?: string };

interface Runtime {
  state: AnySedaState | null;
  /** Chamadas de `useState` no desenho atual: a página tem uma só. */
  stateCalls: number;
  toasts: { message: string; type: string }[];
  navigations: string[];
}

let active: Runtime | null = null;

function runtime(): Runtime {
  if (!active) throw new Error('Hook do ANY chamado fora de render()');
  return active;
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

const FRAGMENT = stub('Fragment');

const jsx = (type: unknown, props: Record<string, unknown>): RawElement => ({
  $$any: true,
  type,
  props: props ?? {},
});

const reactStub = {
  useState(initial: unknown) {
    const rt = runtime();
    rt.stateCalls += 1;
    if (rt.stateCalls > 1) throw new Error('SedaPath passou a ter mais de um useState');
    if (rt.state === null) rt.state = initial as AnySedaState;
    const owner = rt;
    const set = (next: unknown) => {
      owner.state =
        typeof next === 'function'
          ? (next as (current: AnySedaState) => AnySedaState)(owner.state as AnySedaState)
          : (next as AnySedaState);
    };
    return [rt.state, set];
  },
  useCallback<T>(callback: T): T {
    return callback;
  },
};

/** Módulos que a página importa, trocados por dublês. */
function fakeRequire(path: string): unknown {
  switch (path) {
    case 'react':
      return reactStub;
    case 'react/jsx-runtime':
      return { jsx, jsxs: jsx, Fragment: FRAGMENT };
    case 'react-router-dom':
      return { useNavigate: () => (to: string) => runtime().navigations.push(to) };
    case '../contexts/WeightContext':
      return { useWeight: () => ({ weight: null, setWeight: () => undefined }) };
    case '../contexts/ToastContext':
      return {
        useToast: () => ({
          addToast: (message: string, type = 'info') => runtime().toasts.push({ message, type }),
        }),
      };
    case '../utils/calculations':
      return { fmt };
    default:
      // Componentes de layout e comuns: um dublê por nome exportado.
      return new Proxy({}, { get: (_target, name) => stub(String(name)) });
  }
}

interface LoadedModule {
  SedaPath: () => unknown;
  internals: AnySedaInternals;
}

let loaded: LoadedModule | null = null;

function load(): LoadedModule {
  if (loaded) return loaded;
  const [, original] = readFileSync(SOURCE, 'utf-8').split(MARKER);
  if (!original) throw new Error('SedaPath.tsx sem o marcador do original');
  const { outputText } = ts.transpileModule(original, {
    fileName: 'SedaPath.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  // Expõe as constantes do módulo sem tocar no original: o trecho é
  // acrescentado ao código já transpilado, no mesmo escopo.
  const code = `${outputText}\nmodule.exports.__internals = { ${INTERNALS.join(', ')} };`;
  const module = { exports: {} as Record<string, unknown> };
  const window = { scrollTo: () => undefined };
  new Function('require', 'module', 'exports', 'window', code)(
    fakeRequire,
    module,
    module.exports,
    window,
  );
  loaded = {
    SedaPath: module.exports.default as () => unknown,
    internals: module.exports.__internals as AnySedaInternals,
  };
  return loaded;
}

export function anySedaInternals(): AnySedaInternals {
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
    return [{ type: `@${component.stubName}`, props, children: expand(props.children) }];
  }
  return [{ type: `#${component.name}`, props, children: expand(component(props)) }];
}

/** Texto visível do nó; o `title` dos componentes importados (AlertCard, Collapsible) entra junto. */
export function textOf(node: AnyNode | readonly AnyNode[]): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map((child) => textOf(child as AnyNode)).join('');
  const element = node as AnyElement;
  const title =
    element.type.startsWith('@') && typeof element.props.title === 'string'
      ? `${element.props.title} `
      : '';
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

/** Pedaços de texto como a tela os mostra, um por nó, com os títulos dos importados. */
export function textFragments(node: AnyNode | readonly AnyNode[]): string[] {
  if (typeof node === 'string') return [node.trim()].filter((text) => text !== '');
  if (Array.isArray(node)) return node.flatMap((child) => textFragments(child as AnyNode));
  const element = node as AnyElement;
  const title =
    element.type.startsWith('@') && typeof element.props.title === 'string'
      ? [element.props.title]
      : [];
  return [...title, ...textFragments(element.children)];
}

const EVENT = { stopPropagation: () => undefined, preventDefault: () => undefined };

function call(element: AnyElement, handler: string, ...args: unknown[]): void {
  const callback = element.props[handler];
  if (typeof callback !== 'function') throw new Error(`${element.type} sem ${handler}`);
  (callback as (...values: unknown[]) => void)(...args);
}

export interface AnyOptionCard {
  title: string;
  description: string;
  color: string;
}

export interface AnyMedOption {
  title: string;
  dose: string;
  indication: string;
  extra: string | null;
  selected: boolean;
}

export interface AnyAlert {
  type: string;
  title: string;
  text: string;
}

/** Uma sessão da página do ANY: estado, toasts e navegação. */
export class AnySedaPage {
  private readonly runtime: Runtime = { state: null, stateCalls: 0, toasts: [], navigations: [] };
  private drawn: { state: AnySedaState; tree: AnyNode[] } | null = null;

  constructor() {
    this.render();
  }

  get state(): AnySedaState {
    if (!this.runtime.state) throw new Error('página do ANY ainda não desenhada');
    return this.runtime.state;
  }

  get toasts(): readonly { message: string; type: string }[] {
    return this.runtime.toasts;
  }

  /**
   * Desenho da página. Para o mesmo objeto de estado o desenho é o mesmo (a
   * página não lê nada além do estado), então ele é reaproveitado até a
   * próxima ação: as 1.000 sequências de toques desenham dezenas de vezes por
   * passo.
   */
  render(): AnyNode[] {
    const { state } = this.runtime;
    if (this.drawn && state !== null && this.drawn.state === state) return this.drawn.tree;
    const tree = this.withHooks(() => expand(load().SedaPath()));
    if (this.runtime.state) this.drawn = { state: this.runtime.state, tree };
    return tree;
  }

  /** Só a área da tela (o `Container`), sem cabeçalho, trilha, rodapé e menu. */
  screenTree(): AnyNode[] {
    const container = findAll(this.render(), (element) => element.type === '@Container')[0];
    if (!container) throw new Error('Container ausente na página do ANY');
    return container.children;
  }

  /** Rótulos da trilha (breadcrumb), na ordem. */
  trail(): string[] {
    const breadcrumb = findAll(this.render(), (element) => element.type === '#Breadcrumb')[0];
    if (!breadcrumb) throw new Error('Breadcrumb ausente na página do ANY');
    return findAll(breadcrumb, (element) => element.type === 'span' && element.children.length > 0)
      .filter((element) => element.children.every((child) => typeof child === 'string'))
      .map((element) => textOf(element).trim())
      .filter((text) => text !== '/' && text !== '');
  }

  optionCards(): AnyOptionCard[] {
    return this.local('OptionCard').map(({ props }) => ({
      title: String(props.title),
      description: String(props.description),
      color: String(props.color),
    }));
  }

  medOptions(): AnyMedOption[] {
    return this.local('MedOption').map(({ props }) => ({
      title: String(props.title),
      dose: String(props.dose),
      indication: String(props['indicação']),
      extra: typeof props.extra === 'string' ? props.extra : null,
      selected: props.selected === true,
    }));
  }

  alerts(): AnyAlert[] {
    return findAll(this.screenTree(), (element) => element.type === '@AlertCard').map(
      (element) => ({
        type: String(element.props.type),
        title: String(element.props.title ?? ''),
        text: textOf(element.children).trim(),
      }),
    );
  }

  /** Quadros de regime em destaque (borda de destaque, fundo escuro): título e linhas. */
  regimenBoxes(): string[][] {
    return findAll(
      this.screenTree(),
      (element) =>
        element.type === 'div' &&
        String(element.props.className ?? '').startsWith('bg-[#1A0A0A] border-2 border-accent'),
    ).map((box) => box.children.map((child) => textOf(child).trim()).filter(Boolean));
  }

  /** Valor do Toggle "Não/Sim" da tela, se houver. */
  toggleValue(): string | null {
    const toggle = findAll(this.screenTree(), (element) => element.type === '@Toggle')[0];
    return toggle ? String(toggle.props.value) : null;
  }

  resultRows(): { label: string; value: string }[] {
    return this.local('ResultRow').map(({ props }) => ({
      label: String(props.label),
      value: String(props.value),
    }));
  }

  checklistItems(): { id: string; label: string; checked: boolean }[] {
    return this.local('ChecklistItem').map(({ props }) => ({
      id: String(props.id),
      label: String(props.label),
      checked: props.checked === true,
    }));
  }

  redFlags(): { id: string; title: string; active: boolean }[] {
    const active = this.state.redflags;
    return this.local('RedFlagCard').map(({ props }) => ({
      id: String(props.id),
      title: String(props.title),
      active: active[String(props.id)] === true,
    }));
  }

  /** Botões clicáveis (HTML ou `Button`), pelo texto; `type` restringe a um dos dois. */
  buttonLabels(type?: 'button' | '@Button'): string[] {
    return this.buttons()
      .filter((element) => !type || element.type === type)
      .map((element) => textOf(element).trim());
  }

  /** Campo de peso da tela (a página tem um por calculadora). */
  hasWeightInput(): boolean {
    return this.weightInput() !== null;
  }

  texts(): string[] {
    return textFragments(this.screenTree());
  }

  // ---- Ações -----------------------------------------------------------------

  chooseOption(title: string): void {
    const card = this.local('OptionCard').find(({ props }) => props.title === title);
    if (!card) throw new Error(`Opção "${title}" não está na tela do ANY`);
    this.withHooks(() => call(card, 'onClick'));
  }

  chooseMed(title: string): void {
    const option = this.local('MedOption').find(({ props }) => props.title === title);
    if (!option) throw new Error(`Medicação "${title}" não está na tela do ANY`);
    this.withHooks(() => call(option, 'onClick'));
  }

  setToggle(value: 'sim' | 'nao'): void {
    const toggle = findAll(this.screenTree(), (element) => element.type === '@Toggle')[0];
    if (!toggle) throw new Error('Toggle ausente na tela do ANY');
    this.withHooks(() => call(toggle, 'onChange', value));
  }

  click(label: string): void {
    const button = this.buttons().find((element) => textOf(element).trim() === label);
    if (!button) throw new Error(`Botão "${label}" não está na tela do ANY`);
    this.withHooks(() => call(button, 'onClick', EVENT));
  }

  typeWeight(value: string): void {
    const input = this.weightInput();
    if (!input) throw new Error('Campo de peso ausente na tela do ANY');
    this.withHooks(() => call(input, 'onChange', { target: { value } }));
  }

  toggleCheck(id: string): void {
    const item = this.local('ChecklistItem').find(({ props }) => props.id === id);
    if (!item) throw new Error(`Item "${id}" não está na tela do ANY`);
    this.withHooks(() => call(item, 'onChange'));
  }

  toggleRedFlag(id: string): void {
    const card = this.local('RedFlagCard').find(({ props }) => props.id === id);
    const clickable = card?.children[0];
    if (!clickable || typeof clickable === 'string') {
      throw new Error(`Red flag "${id}" não está na tela do ANY`);
    }
    this.withHooks(() => call(clickable, 'onClick', EVENT));
  }

  /** "Reiniciar Fluxo" do menu flutuante. */
  restart(): void {
    const fab = findAll(this.render(), (element) => element.type === '@FABMenu')[0];
    const items = fab?.props.items as { label: string; onClick: () => void }[] | undefined;
    const restart = items?.find(({ label }) => label === 'Reiniciar Fluxo');
    if (!restart) throw new Error('Menu "Reiniciar Fluxo" ausente no ANY');
    this.withHooks(() => restart.onClick());
  }

  private local(name: string): AnyElement[] {
    return findAll(this.screenTree(), (element) => element.type === `#${name}`);
  }

  private weightInput(): AnyElement | null {
    return (
      findAll(
        this.screenTree(),
        (element) => element.type === 'input' && element.props.type === 'number',
      )[0] ?? null
    );
  }

  private buttons(): AnyElement[] {
    return findAll(
      this.screenTree(),
      (element) =>
        (element.type === 'button' || element.type === '@Button') &&
        typeof element.props.onClick === 'function',
    );
  }

  private withHooks<T>(run: () => T): T {
    const previous = active;
    active = this.runtime;
    this.runtime.stateCalls = 0;
    try {
      return run();
    } finally {
      active = previous;
    }
  }
}
