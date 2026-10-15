import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

/**
 * Executa a lógica do `AclsGuide` do ANY a partir da referência congelada
 * (tests/any-reference/AclsGuide.tsx), sem editar nada dela.
 *
 * O reducer, o conteúdo e as contas do ANY moram dentro de um componente
 * React que importa logo, roteador e contextos; importar o arquivo não
 * funciona fora do app. Então este módulo lê o texto, recorta trechos que
 * não dependem de React (o reducer e o conteúdo inteiros; `getGuide`,
 * `getNudges`, `generateReport` e o cálculo da FCT de dentro do componente),
 * tira os tipos com o compilador do TypeScript e roda o JavaScript que sobra.
 * Os trechos são achados por texto que existe no original: se o ANY mudar,
 * o recorte falha alto em vez de comparar com outra coisa.
 *
 * O tempo do ANY vem de `Date.now()`: quem chama controla com
 * `vi.setSystemTime`.
 */

const REFERENCE = join(process.cwd(), 'tests/any-reference/AclsGuide.tsx');
const MARKER = '// ---- início do arquivo original ----\n';

function original(): string {
  const content = readFileSync(REFERENCE, 'utf-8');
  const body = content.split(MARKER)[1];
  if (!body) throw new Error('AclsGuide.tsx sem o marcador do original');
  return body;
}

function slice(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + 1);
  if (start < 0 || end < 0) throw new Error(`Trecho do ANY não encontrado: ${from} … ${to}`);
  return source.slice(start, end);
}

function toJs(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

export type AnyRhythm = 'shockable' | 'nonshockable';

export interface AnyEvent {
  time: number;
  type: string;
  detail: string;
}

export interface AnyState {
  running: boolean;
  startTime: number | null;
  rhythm: AnyRhythm | null;
  cycleCount: number;
  shockCount: number;
  events: AnyEvent[];
  lastEpiTime: number | null;
  epiInterval: number;
  amio300Given: boolean;
  amio150Given: boolean;
  advancedAirway: boolean;
  outcome: 'rosc' | 'death' | null;
  endTime: number | null;
  pauseStart: number | null;
  totalPauseTime: number;
  cycleStartTime: number | null;
  medCounts: Record<string, number>;
}

export type AnyAction =
  | { type: 'START' }
  | { type: 'SET_RHYTHM'; rhythm: AnyRhythm }
  | { type: 'INCREMENT_CYCLE' }
  | { type: 'REGISTER_SHOCK' }
  | { type: 'REGISTER_MED'; name: string }
  | { type: 'SET_ADVANCED_AIRWAY'; value: boolean }
  | { type: 'SET_EPI_INTERVAL'; value: number }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'ADD_EVENT'; event: AnyEvent }
  | { type: 'FINISH_ROSC' }
  | { type: 'FINISH_DEATH' }
  | { type: 'RESET' }
  | { type: 'SET_LAST_EPI_TIME'; time: number };

export interface AnyHsTs {
  name: string;
  action: string;
  link?: { label: string; path: string };
}

export interface AnyAcls {
  OVACE_SIGNS: string[];
  HS_CAUSES: AnyHsTs[];
  TS_CAUSES: AnyHsTs[];
  MEDICATIONS: { name: string; dose: string; group: string }[];
  ROSC_CHECKLIST: string[];
  INITIAL_STATE: AnyState;
  aclsReducer: (state: AnyState, action: AnyAction) => AnyState;
  formatElapsed: (seconds: number) => string;
  getElapsed: (startTime: number | null) => number;
}

export interface AnyGuide {
  text: string;
  sub: string;
  type: 'action' | 'info' | 'alert' | 'success';
}

export interface AnyNudge {
  id: string;
  text: string;
  urgent: boolean;
}

export interface AnyComponentScope {
  state: AnyState;
  /** O `totalElapsed` do componente (segundos desde o início, atualizado a cada 1 s). */
  totalElapsed: number;
  /** `localStorage` em memória: o `generateReport` lê e grava `acls_records`. */
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}

export interface AnyComponentLogic {
  getGuide: () => AnyGuide;
  getNudges: () => AnyNudge[];
  generateReport: () => string;
  fct: number | null;
}

let cached: { module: AnyAcls; component: (scope: AnyComponentScope) => AnyComponentLogic } | null =
  null;

function load() {
  if (cached) return cached;
  const source = original();

  const moduleJs = toJs(slice(source, 'const OVACE_SIGNS', '// HOOKS'));
  const module = new Function(
    `${moduleJs}
     return { OVACE_SIGNS, HS_CAUSES, TS_CAUSES, MEDICATIONS, ROSC_CHECKLIST, INITIAL_STATE,
              aclsReducer, formatElapsed, getElapsed };`,
  )() as AnyAcls;

  const guide = slice(source, 'function getGuide()', '// NUDGE LOGIC');
  const nudges = slice(source, 'function getNudges()', '// ACTIONS');
  const report = slice(source, 'function generateReport()', 'function handleShowReport()');
  const fct = slice(source, 'const fct = useMemo(', '// FAB ITEMS');
  const componentJs = toJs(`${guide}\n${nudges}\n${report}\n${fct}`);
  const factory = new Function(
    'scope',
    'getElapsed',
    'formatElapsed',
    `const { state, totalElapsed } = scope;
     const stateRef = { current: state };
     const localStorage = scope.storage;
     const useMemo = (compute) => compute();
     ${componentJs}
     return { getGuide, getNudges, generateReport, fct };`,
  ) as (
    scope: AnyComponentScope,
    getElapsed: AnyAcls['getElapsed'],
    formatElapsed: AnyAcls['formatElapsed'],
  ) => AnyComponentLogic;

  cached = {
    module,
    component: (scope) => factory(scope, module.getElapsed, module.formatElapsed),
  };
  return cached;
}

/** Reducer, conteúdo e helpers do ANY. */
export function anyAcls(): AnyAcls {
  return load().module;
}

/** `getGuide`, `getNudges`, `generateReport` e a FCT do componente, para um estado. */
export function anyComponent(scope: AnyComponentScope): AnyComponentLogic {
  return load().component(scope);
}

/**
 * Textos da tela de OVACE do ANY, que estão no JSX e não num dado: todo texto
 * entre tags do trecho da tela, com os espaços da indentação colapsados.
 */
export function anyOvaceTexts(): string[] {
  const screen = slice(
    original(),
    '{/* ===== SCREEN: OVACE ===== */}',
    '{/* ===== SCREEN: RHYTHM ===== */}',
  );
  return (
    [...screen.matchAll(/>([^<>{}]+)</g)]
      .map((match) => (match[1] ?? '').replace(/\s+/g, ' ').trim())
      // Sobra de sintaxe ("(" de um `&& (`) não é texto de tela.
      .filter((text) => /[\p{L}\d]/u.test(text))
  );
}

/** Lê o `defaultConfig` do `MetronomeContext` do ANY (110/min, ventilação a cada 6 s). */
export function anyMetronomeDefaults(): {
  bpm: number;
  ventEnabled: boolean;
  ventIntervalMs: number;
} {
  const content = readFileSync(
    join(process.cwd(), 'tests/any-reference/MetronomeContext.tsx'),
    'utf-8',
  );
  const body = content.split(MARKER)[1] ?? '';
  const declaration = body.match(/const defaultConfig: MetronomeConfig = (\{[^}]+\})/)?.[1];
  if (!declaration) throw new Error('defaultConfig do metrônomo do ANY não encontrado');
  return new Function(`return (${declaration});`)() as {
    bpm: number;
    ventEnabled: boolean;
    ventIntervalMs: number;
  };
}

/** Frequências e durações dos sons do `MetronomeContext` do ANY, lidas do original. */
export function anyMetronomeSource(): string {
  const content = readFileSync(
    join(process.cwd(), 'tests/any-reference/MetronomeContext.tsx'),
    'utf-8',
  );
  return content.split(MARKER)[1] ?? '';
}
