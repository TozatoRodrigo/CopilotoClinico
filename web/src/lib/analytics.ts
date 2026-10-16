import type { CopilotFeedbackKind, IntakeAnswerChannel } from '@/lib/types';

/**
 * CC-704 — eventos de produto no Umami (autoalojado, sem cookie; ver o script
 * em app/layout.tsx).
 *
 * Só havia pageview: nada dizia quais fluxos, ferramentas e cartões os médicos
 * usam. Este módulo é a ÚNICA porta para eventos: a lista é fechada e cada
 * propriedade tem um tipo que não aceita texto livre — valor de uma lista,
 * número inteiro (contagem, duração em segundos), sim/não, ou id de
 * ferramenta (kebab-case curto, nunca um UUID). Nenhum dado clínico, nenhum
 * identificador de paciente, caso ou análise. Evento que não passa na
 * validação não sai.
 *
 * Sem o script do Umami (build local, CI, e2e, bloqueador de anúncio), tudo
 * vira no-op. Para um evento novo: acrescente-o em PRODUCT_EVENTS (o teste
 * confere que nenhuma propriedade aceita texto livre) e em docs/runbook.md.
 */

/** Teto das durações: uma análise leva minutos; acima de 1 h é aba esquecida. */
export const MAX_DURATION_S = 3600;

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ID_MAX_CHARS = 64;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Sequência longa de dígitos num id pode ser CPF, telefone ou prontuário. */
const LONG_DIGIT_RUN = /\d{5,}/;

interface OptionalFlag {
  readonly optional?: true;
}

export type PropSpec =
  | (OptionalFlag & { readonly kind: 'enum'; readonly values: readonly string[] })
  | (OptionalFlag & { readonly kind: 'count'; readonly max: number })
  | (OptionalFlag & { readonly kind: 'flag' })
  | (OptionalFlag & { readonly kind: 'id' });

function oneOf<const Values extends readonly string[]>(values: Values) {
  return { kind: 'enum', values } as const;
}

function count(max: number) {
  return { kind: 'count', max } as const;
}

function optional<const Spec extends PropSpec>(spec: Spec) {
  return { ...spec, optional: true } as const;
}

const flag = { kind: 'flag' } as const;

/** Id de um registro do sistema (ferramenta, cartão), nunca de paciente ou caso. */
const contentId = { kind: 'id' } as const;

const duration = count(MAX_DURATION_S);
const round = oneOf(['inicial', 'reanalise']);

const FEEDBACK_KINDS = [
  'wrong_scenario',
  'missing_coverage',
  'wrong_recommendation',
  'helpful',
] as const satisfies readonly CopilotFeedbackKind[];

const ANSWER_CHANNELS = ['tap', 'text', 'voice'] as const satisfies readonly IntakeAnswerChannel[];

/**
 * A lista fechada de eventos e das propriedades de cada um.
 * - análise iniciada: o caso enviado (`inicial`) ou a reanálise pedida depois
 *   do plano; concluída: o plano entregue, com a duração da montagem;
 * - pergunta respondida: antes do plano (leitura do caso, com o canal) ou
 *   depois dele (perguntas da decisão);
 * - ferramenta aberta, cálculo feito, cartão aberto e pergunta rápida: prontos
 *   para as áreas que ainda vão existir (Ferramentas, cartões, pergunta rápida);
 * - feedback enviado e "não encontrei o que precisava" (CC-703).
 */
export const PRODUCT_EVENTS = {
  analise_iniciada: { rodada: round },
  analise_concluida: { rodada: round, duracao_s: duration },
  pergunta_respondida: {
    fase: oneOf(['antes_do_plano', 'depois_do_plano']),
    canal: optional(oneOf(ANSWER_CHANNELS)),
  },
  ferramenta_aberta: {
    ferramenta: contentId,
    origem: optional(oneOf(['hub', 'busca', 'plano', 'link'])),
  },
  calculo_feito: { ferramenta: contentId },
  cartao_aberto: { cartao: contentId, origem: oneOf(['plano', 'pergunta_rapida', 'busca']) },
  pergunta_rapida: { fonte: oneOf(['cartao', 'modelo']), duracao_s: duration },
  feedback_enviado: { tipo: oneOf(FEEDBACK_KINDS) },
  nao_encontrei: { com_nota: flag },
} as const satisfies Record<string, Record<string, PropSpec>>;

type EventSpecs = typeof PRODUCT_EVENTS;

export type ProductEvent = keyof EventSpecs;

type PropValue<Spec> = Spec extends { kind: 'enum'; values: readonly (infer Value)[] }
  ? Value
  : Spec extends { kind: 'count' }
    ? number
    : Spec extends { kind: 'flag' }
      ? boolean
      : Spec extends { kind: 'id' }
        ? string
        : never;

type RequiredKeys<Props> = {
  [Key in keyof Props]: Props[Key] extends { optional: true } ? never : Key;
}[keyof Props];

type OptionalKeys<Props> = Exclude<keyof Props, RequiredKeys<Props>>;

export type ProductEventProps<Event extends ProductEvent> = {
  [Key in RequiredKeys<EventSpecs[Event]>]: PropValue<EventSpecs[Event][Key]>;
} & {
  [Key in OptionalKeys<EventSpecs[Event]>]?: PropValue<EventSpecs[Event][Key]>;
};

export type EventData = Record<string, string | number | boolean>;

function hasKey(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isAllowedValue(spec: PropSpec, value: unknown): value is string | number | boolean {
  switch (spec.kind) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value);
    case 'count':
      return (
        typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= spec.max
      );
    case 'flag':
      return typeof value === 'boolean';
    case 'id':
      return (
        typeof value === 'string' &&
        value.length <= ID_MAX_CHARS &&
        ID_PATTERN.test(value) &&
        !UUID_PATTERN.test(value) &&
        !LONG_DIGIT_RUN.test(value)
      );
  }
}

/**
 * Confere as propriedades contra a lista fechada. `null` quando o evento não
 * existe, falta propriedade obrigatória, sobra propriedade fora da lista ou um
 * valor não é do tipo permitido. Exportada para o teste.
 */
export function validateEventProps(event: string, props: unknown): EventData | null {
  if (!hasKey(PRODUCT_EVENTS, event)) return null;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return null;
  const specs: Record<string, PropSpec> = PRODUCT_EVENTS[event as ProductEvent];
  const given = props as Record<string, unknown>;

  if (Object.keys(given).some((key) => !hasKey(specs, key))) return null;

  const data: EventData = {};
  for (const [key, spec] of Object.entries(specs)) {
    const value = given[key];
    if (value === undefined) {
      if (spec.optional) continue;
      return null;
    }
    if (!isAllowedValue(spec, value)) return null;
    data[key] = value;
  }
  return data;
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * O Umami anexa a URL da página ao evento, e a do caso traz o id do
 * atendimento (`/encounters/<uuid>/conversation`). No evento vai a rota, sem
 * o id e sem a query: `/encounters/:id/conversation`.
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url, 'https://copiloto.invalid');
    const path = parsed.pathname
      .split('/')
      .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
      .join('/');
    return HAS_SCHEME.test(url) ? `${parsed.origin}${path}` : path;
  } catch {
    return undefined;
  }
}

/** Segundos inteiros desde `startedAtMs`, dentro do teto aceito pelos eventos. */
export function secondsSince(startedAtMs: number): number {
  const seconds = Math.round((Date.now() - startedAtMs) / 1000);
  return Math.min(MAX_DURATION_S, Math.max(0, seconds));
}

interface UmamiPayload {
  url?: string;
  referrer?: string;
  [key: string]: unknown;
}

interface UmamiTracker {
  track: (build: (defaults: UmamiPayload) => UmamiPayload) => unknown;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

/**
 * Registra um evento de produto. Tipado pela lista fechada; a validação em
 * tempo de execução segura o que escapa do tipo (um `as`, um valor vindo do
 * servidor). Nunca lança: medir uso não pode atrapalhar o plantão.
 */
export function trackEvent<Event extends ProductEvent>(
  event: Event,
  props: ProductEventProps<Event>,
): void {
  const data = validateEventProps(event, props);
  if (!data) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[analytics] evento "${event}" recusado: propriedade fora da lista`);
    }
    return;
  }

  const umami = typeof window === 'undefined' ? undefined : window.umami;
  if (typeof umami?.track !== 'function') return;

  try {
    umami.track((defaults) => ({
      ...defaults,
      url: sanitizeUrl(defaults.url),
      referrer: sanitizeUrl(defaults.referrer),
      name: event,
      data,
    }));
  } catch {
    // O script do Umami falhou: o evento se perde, a tela segue.
  }
}
