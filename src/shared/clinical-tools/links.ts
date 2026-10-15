import { CALCULATOR_CATALOG } from './calculator-catalog';
import { calculatorName, calculatorStatus, TOOLS, type ToolEntry } from './catalog';

/**
 * Ligações entre ferramentas (CC-331): o Choque abre a noradrenalina em
 * Infusões, o TEP a heparina, o ACLS a Via aérea, e o médico volta ao mesmo
 * ponto. No legado o `goToInfusion(droga)` guardava o estado; no ANY v2 o
 * `?drug=` era ignorado e o estado se perdia.
 *
 * O estado de cada roteiro mora na sessão da aba (web/src/lib/tool-session.ts)
 * e volta sozinho. O endereço carrega só o que o destino precisa para abrir
 * no lugar certo (`?droga=`, `?indicacao=`, `?aba=`) e de onde o médico veio
 * (`?de=`), para o destino oferecer o caminho de volta — no app instalado não
 * há botão "voltar" do navegador. Nada de paciente vai no endereço.
 */

/** Parâmetro com a origem: id da ferramenta ou `calculadoras/<id>`. */
export const ORIGIN_PARAM = 'de';

/**
 * Parâmetro da ferramenta aberta pelo plano do Copiloto (CC-332): um token
 * opaco que aponta para a sessão da aba, onde estão o caso e os dados que
 * preencheram a ferramenta. O dado nunca vai no endereço.
 */
export const CASE_LINK_PARAM = 'caso';

/** De onde o médico saiu: um roteiro ou uma calculadora. */
export type ToolOrigin = { tool: string } | { calculator: string };

export function originValue(origin: ToolOrigin): string {
  return 'tool' in origin ? origin.tool : `calculadoras/${origin.calculator}`;
}

/** Endereço da tela inicial de uma ferramenta do catálogo. */
export function toolPath(toolId: string): string {
  return `/ferramentas/${toolId}`;
}

type Query = Readonly<Record<string, string | null | undefined>>;

/**
 * Junta o caminho e os parâmetros, na ordem dada, pulando os vazios. Sem
 * `URLSearchParams`: o motor não depende de API do navegador nem do Node.
 */
export function withQuery(path: string, query: Query): string {
  const pairs = Object.entries(query)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    // `/` fica legível em `de=calculadoras/ciwa-ar`; o resto é codificado.
    .map(([name, value]) => `${name}=${encodeURIComponent(value).replace(/%2F/g, '/')}`);
  return pairs.length > 0 ? `${path}?${pairs.join('&')}` : path;
}

export interface ToolLinkOptions {
  /** De onde o médico sai, para o destino oferecer a volta. */
  from?: ToolOrigin;
  /** Onde abrir dentro da ferramenta (`{ aba: 'vti' }`). */
  query?: Query;
}

/** Endereço de outra ferramenta, com o lugar de abrir e a origem. */
export function toolHref(toolId: string, options: ToolLinkOptions = {}): string {
  return withQuery(toolPath(toolId), {
    ...options.query,
    [ORIGIN_PARAM]: options.from ? originValue(options.from) : undefined,
  });
}

/** Endereço de uma calculadora aberta por um roteiro (o nomograma pela Toxicologia). */
export function calculatorHref(calculatorId: string, options: { from?: ToolOrigin } = {}): string {
  return withQuery(`/ferramentas/calculadoras/${calculatorId}`, {
    [ORIGIN_PARAM]: options.from ? originValue(options.from) : undefined,
  });
}

export interface ToolReturn {
  href: string;
  /** Nome do roteiro ou da calculadora de onde o médico veio. */
  label: string;
}

/**
 * Origem a partir da rota atual: `/ferramentas/choque-septico/...` é o roteiro,
 * `/ferramentas/calculadoras/ciwa-ar` é a calculadora. Fora das Ferramentas,
 * ou na lista de calculadoras, não há origem.
 */
export function originFromPath(pathname: string): ToolOrigin | null {
  const [area, section, id] = pathname.split('/').filter(Boolean);
  if (area !== 'ferramentas' || !section) return null;
  if (section === 'calculadoras') return id ? { calculator: id } : null;
  return { tool: section };
}

type Params = { get(name: string): string | null };

/** O `?de=` como veio (sem conferir se existe): para repassar ao trocar de droga. */
export function readOrigin(params: Params): ToolOrigin | null {
  const raw = params.get(ORIGIN_PARAM)?.trim();
  if (!raw || !/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(raw)) return null;
  const calculator = /^calculadoras\/([a-z0-9-]+)$/.exec(raw)?.[1];
  if (calculator) return { calculator };
  return raw.includes('/') ? null : { tool: raw };
}

/**
 * Lê o `?de=` do destino. Só vale ferramenta ou calculadora que existe e abre:
 * endereço editado à mão, ou ferramenta que voltou a "em breve", não vira
 * link.
 */
export function readToolReturn(
  params: Params,
  tools: readonly ToolEntry[] = TOOLS,
): ToolReturn | null {
  const origin = readOrigin(params);
  if (!origin) return null;
  if ('calculator' in origin) {
    const entry = CALCULATOR_CATALOG.find(({ id }) => id === origin.calculator);
    if (!entry || calculatorStatus(entry) !== 'disponivel') return null;
    return { href: `/ferramentas/calculadoras/${entry.id}`, label: calculatorName(entry) };
  }
  const tool = tools.find(({ id, status }) => id === origin.tool && status === 'disponivel');
  return tool ? { href: toolPath(tool.id), label: tool.name } : null;
}
