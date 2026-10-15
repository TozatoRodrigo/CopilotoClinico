import { normalizeSearchText } from '../catalog';
import { ORIGIN_PARAM, originValue, withQuery, type ToolOrigin } from '../links';
import { INFUSION_CATEGORIES, INFUSION_DRUGS } from './drugs';
import type { HeparinIndication } from './heparin';

/**
 * O que a tela de Infusões lista e abre pelo endereço: as 16 drogas (CC-311)
 * e os protocolos de heparina e insulina (CC-312). Serve à busca da própria
 * tela, ao ⌘K e ao `?droga=` que as outras ferramentas usam para linkar para
 * cá (o TEP do ANY já linkava `?drug=heparina`).
 */

export const INFUSION_GROUPS = [
  ...INFUSION_CATEGORIES,
  { id: 'protocols', label: 'Protocolos' },
] as const;

export type InfusionGroupId = (typeof INFUSION_GROUPS)[number]['id'];

export interface InfusionItem {
  id: string;
  name: string;
  aliases: readonly string[];
  group: InfusionGroupId;
  /** Droga com dose ↔ mL/h, ou protocolo com tela própria. */
  kind: 'droga' | 'heparina' | 'insulina';
}

export const INFUSION_ITEMS: readonly InfusionItem[] = [
  ...INFUSION_DRUGS.map(
    ({ id, name, aliases, category }): InfusionItem => ({
      id,
      name,
      aliases,
      group: category,
      kind: 'droga',
    }),
  ),
  {
    id: 'heparina',
    name: 'Heparina',
    aliases: ['hnf', 'heparina não fracionada', 'ttpa', 'anticoagulação', 'tep', 'sca'],
    group: 'protocols',
    kind: 'heparina',
  },
  {
    id: 'insulina',
    name: 'Insulina regular',
    aliases: ['insulina', 'glicemia', 'hiperglicemia', 'insulina regular'],
    group: 'protocols',
    kind: 'insulina',
  },
];

const BY_ID = new Map(INFUSION_ITEMS.map((item) => [item.id, item]));

export function findInfusionItem(id: string | null | undefined): InfusionItem | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/**
 * Busca do ANY (`searchDrug`: nome, id ou sinônimo contendo o texto), sem
 * acento e sem diferença de caixa. Busca vazia não filtra nada: devolve [].
 */
export function searchInfusionItems(query: string): InfusionItem[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return [];
  return INFUSION_ITEMS.filter((item) =>
    [item.name, item.id, ...item.aliases].some((text) =>
      normalizeSearchText(text).includes(normalized),
    ),
  );
}

export interface InfusionUrlSelection {
  /** O que veio no endereço, já sem espaço e em minúsculas; `null` se nada. */
  requested: string | null;
  /** O item correspondente; `null` se não há pedido ou ele não existe. */
  item: InfusionItem | null;
  /** Veio pelo `?drug=` dos links antigos do ANY (Choque, TEP, Via aérea). */
  legacy: boolean;
  /** `?indicacao=` da heparina (o TEP abre em 80/18 UI/kg); `null` se nada ou inválida. */
  indication: HeparinIndication | null;
  /** `?grupo=` da lista: o grupo que aparece primeiro (a sedação pós-IOT da Via aérea). */
  group: InfusionGroupId | null;
}

const INDICATIONS: readonly HeparinIndication[] = ['sca', 'tep'];

function isIndication(value: string | null): value is HeparinIndication {
  return INDICATIONS.includes(value as HeparinIndication);
}

function isGroup(value: string | null): value is InfusionGroupId {
  return INFUSION_GROUPS.some(({ id }) => id === value);
}

/**
 * Lê a droga pedida no endereço: `?droga=<id>` ou o `?drug=` que o ANY usava
 * (lá o link existia, mas a tela ignorava o parâmetro). Aceita o id ou um
 * sinônimo exato ("nora"), sem acento e sem caixa.
 */
export function readInfusionParam(params: {
  get(name: string): string | null;
}): InfusionUrlSelection {
  const current = params.get('droga');
  const legacyValue = current === null ? params.get('drug') : null;
  const raw = current ?? legacyValue;
  const requested = raw === null || raw.trim() === '' ? null : normalizeSearchText(raw);
  const item = requested
    ? (BY_ID.get(requested) ??
      INFUSION_ITEMS.find((candidate) =>
        candidate.aliases.some((alias) => normalizeSearchText(alias) === requested),
      ) ??
      null)
    : null;
  const indication = params.get('indicacao');
  const group = params.get('grupo');
  return {
    requested,
    item,
    legacy: legacyValue !== null,
    indication: item?.kind === 'heparina' && isIndication(indication) ? indication : null,
    group: isGroup(group) ? group : null,
  };
}

export interface InfusionLinkOptions {
  /** Heparina: abre já na indicação. Sem isso, a tela abre na última usada (SCA, 60/12 UI/kg). */
  indication?: HeparinIndication;
  /** Lista sem droga aberta: o grupo que aparece primeiro. */
  group?: InfusionGroupId;
  /** De onde o médico veio, para a tela oferecer a volta (CC-331). */
  from?: ToolOrigin | null;
}

/** Endereço da tela com o item aberto (ou a lista) e, se houver, a origem. */
export function infusionHref(id?: string | null, options: InfusionLinkOptions = {}): string {
  return withQuery('/ferramentas/infusoes', {
    droga: id,
    indicacao: options.indication,
    grupo: options.group,
    [ORIGIN_PARAM]: options.from ? originValue(options.from) : undefined,
  });
}
