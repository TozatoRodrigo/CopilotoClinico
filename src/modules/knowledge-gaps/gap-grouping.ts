/**
 * CC-409 — agrupamento determinístico de lacunas: mesma síndrome e consultas
 * próximas, por normalização e termos. Sem embedding: o provedor está
 * desligado na produção desde 12/10, e a fila precisa agrupar do mesmo jeito
 * em qualquer ambiente — e o curador precisa entender por que duas lacunas
 * caíram juntas.
 *
 * A mesma comparação decide quando um cartão publicado cobre um grupo: o
 * cartão cobre os grupos em que o tema e a pergunta dele cairiam.
 */

/** Radical de 6 letras, como o portão dos cartões: "hemorragia" e "hemorrágico" juntos. */
const STEM_LENGTH = 6;
const MIN_TERM_LENGTH = 3;

function stem(word: string): string {
  return word.slice(0, STEM_LENGTH);
}

/**
 * Palavras que não dizem o tema: ligação, pergunta e termos genéricos de
 * conduta. "dose de amoxicilina" e "conduta na amoxicilina" falam da
 * amoxicilina. Já sem acento e cortadas no radical (ver `gapTerms`).
 */
const STOPWORDS = new Set(
  [
    // ligação
    'de',
    'da',
    'do',
    'das',
    'dos',
    'em',
    'na',
    'no',
    'nas',
    'nos',
    'por',
    'pelo',
    'pela',
    'com',
    'sem',
    'para',
    'pra',
    'que',
    'ou',
    'um',
    'uma',
    'uns',
    'umas',
    'ao',
    'aos',
    'as',
    'os',
    'se',
    'entre',
    'apos',
    'antes',
    'sobre',
    'qual',
    'quais',
    'como',
    'quando',
    'onde',
    'quanto',
    'quanta',
    'deve',
    'devo',
    'pode',
    'posso',
    'fazer',
    'usar',
    // conduta genérica
    'dose',
    'doses',
    'dosagem',
    'posologia',
    'manejo',
    'tratamento',
    'conduta',
    'abordagem',
    'diagnostico',
    'avaliacao',
    'indicacao',
    'criterio',
    'criterios',
    'protocolo',
    'diretriz',
    'emergencia',
    'pronto',
    'socorro',
    'paciente',
    'adulto',
    'adultos',
    'crianca',
    'criancas',
    'pediatrico',
    'pediatrica',
    'inicial',
    'primeira',
    'linha',
    'redacted',
  ].map(stem),
);

/** Termos em comum mínimos para juntar (ou o tamanho do menor conjunto, se for menor). */
export const MIN_SHARED_TERMS = 2;
/** Fração mínima do menor conjunto de termos que precisa estar no outro. */
export const MIN_TERM_OVERLAP = 0.5;

/** Marca da máscara de PII (`[REDACTED_CPF]`): não é tema. */
const PII_TAG = /\[REDACTED_[A-Z]+\]/g;

/**
 * Termos de uma lacuna: as consultas sem acento, em minúsculas, sem número,
 * sem palavra genérica e cortadas no radical — em ordem alfabética, sem
 * repetição. Duas lacunas com os mesmos termos são a mesma lacuna.
 */
export function gapTerms(queries: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const query of queries) {
    const words = query
      .replace(PII_TAG, ' ')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    for (const word of words) {
      if (word.length < MIN_TERM_LENGTH || /\d/.test(word)) continue;
      const term = stem(word);
      if (!STOPWORDS.has(term)) terms.add(term);
    }
  }
  return [...terms].sort();
}

/** Síndrome que separa temas; `outro` e a falta dela não separam nada. */
export function specificSyndrome(syndrome: string | null | undefined): string | null {
  return syndrome && syndrome !== 'outro' ? syndrome : null;
}

/** Duas síndromes definidas e diferentes separam; o resto não. */
export function syndromesCompatible(a: string | null, b: string | null): boolean {
  const left = specificSyndrome(a);
  const right = specificSyndrome(b);
  return left === null || right === null || left === right;
}

export interface TermOverlap {
  shared: number;
  /** Termos em comum sobre o tamanho do menor conjunto. */
  overlap: number;
  /** Termos em comum sobre a união: desempata a favor do grupo mais parecido. */
  jaccard: number;
}

export function termOverlap(a: readonly string[], b: readonly string[]): TermOverlap {
  const right = new Set(b);
  const shared = a.filter((term) => right.has(term)).length;
  const smaller = Math.min(a.length, b.length);
  const union = a.length + b.length - shared;
  return {
    shared,
    overlap: smaller === 0 ? 0 : shared / smaller,
    jaccard: union === 0 ? 0 : shared / union,
  };
}

/** Os termos de `a` e de `b` falam do mesmo tema. */
export function termsMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const { shared, overlap } = termOverlap(a, b);
  const minShared = Math.min(MIN_SHARED_TERMS, a.length, b.length);
  return shared >= minShared && overlap >= MIN_TERM_OVERLAP;
}

export interface GapSignal {
  syndrome: string | null;
  terms: readonly string[];
}

export interface GroupCandidate {
  id: string;
  syndrome: string | null;
  signature: readonly string[];
  createdAt: Date;
}

/**
 * O grupo de uma lacuna nova, ou `null` para abrir outro.
 *
 * - Síndromes definidas e diferentes nunca se juntam.
 * - Lacuna sem consulta (análise sem entendimento) só se junta a grupo sem
 *   consulta da mesma síndrome: não há tema para comparar.
 * - Com consulta: `termsMatch` contra a assinatura do grupo (fixa, a da
 *   lacuna que o abriu). Mais de um grupo serve: o de maior sobreposição,
 *   depois o de maior Jaccard, depois o mais antigo — a mesma entrada cai
 *   sempre no mesmo grupo.
 */
export function findMatchingGroup<T extends GroupCandidate>(
  gap: GapSignal,
  groups: readonly T[],
): T | null {
  const compatible = groups.filter((group) => syndromesCompatible(gap.syndrome, group.syndrome));
  if (gap.terms.length === 0) {
    const syndrome = specificSyndrome(gap.syndrome);
    return (
      [...compatible]
        .filter(
          (group) => group.signature.length === 0 && specificSyndrome(group.syndrome) === syndrome,
        )
        .sort(byAge)[0] ?? null
    );
  }
  const scored = compatible
    .filter((group) => termsMatch(gap.terms, group.signature))
    .map((group) => ({ group, ...termOverlap(gap.terms, group.signature) }));
  scored.sort((a, b) => b.overlap - a.overlap || b.jaccard - a.jaccard || byAge(a.group, b.group));
  return scored[0]?.group ?? null;
}

function byAge(a: GroupCandidate, b: GroupCandidate): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

export interface CardSignal {
  syndrome: string | null;
  /** Tema e pergunta do cartão. */
  texts: readonly string[];
}

/**
 * O cartão cobre o grupo: síndromes compatíveis e o tema e a pergunta do
 * cartão cairiam no grupo. Grupo sem consulta nunca é coberto por
 * semelhança — só pelo rascunho pedido da fila.
 */
export function cardCoversGroup(
  card: CardSignal,
  group: Pick<GroupCandidate, 'syndrome' | 'signature'>,
): boolean {
  if (!syndromesCompatible(card.syndrome, group.syndrome)) return false;
  return termsMatch(gapTerms(card.texts), group.signature);
}
