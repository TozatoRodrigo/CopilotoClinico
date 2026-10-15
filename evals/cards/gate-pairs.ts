import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { maskPII } from '../../src/modules/copilot/guardrails/pii-filter';
import type {
  CardRelevanceContext,
  RelevanceCard,
} from '../../src/modules/knowledge-cards/card-retrieval/card-relevance-gate';
import { PS_SYNDROMES } from '../../src/shared/contracts/clinical';

/**
 * CC-407 — pares rotulados do bake-off do portão de relevância: uma situação
 * (o que o portão recebe — o entendimento de um caso ou uma pergunta rápida,
 * mascarados), um cartão candidato e o rótulo do médico: o cartão se aplica
 * (`relevant`) ou não (`irrelevant`). Formato em docs/evals/portao-de-relevancia.md.
 */

const SituationSchema = z
  .object({
    /**
     * `case`: o entendimento de um caso (representação do problema, como a
     * Etapa 1 escreve). `quick_question`: a pergunta rápida da CC-501, que
     * vai ao portão como hipótese, sem síndrome nem entendimento.
     */
    kind: z.enum(['case', 'quick_question']),
    text: z.string().trim().min(5).max(2000),
    syndrome: z.enum(PS_SYNDROMES).nullable().default(null),
    hypotheses: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  })
  .strict()
  .refine(
    (situation) =>
      situation.kind === 'case' ||
      (situation.syndrome === null && situation.hypotheses.length === 0),
    { message: 'pergunta rápida não tem síndrome nem hipóteses: a pergunta é a hipótese' },
  );

const LabelerSchema = z.discriminatedUnion('kind', [
  /** `id`: iniciais ou CRM/UF de quem rotulou — nunca dado de paciente. */
  z.object({ kind: z.literal('physician'), id: z.string().trim().min(2).max(80) }).strict(),
  /** Par sintético gerado para testar o harness: não vale para decidir o portão. */
  z.object({ kind: z.literal('seed') }).strict(),
]);

const PairSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'id em kebab-case'),
    situation: SituationSchema,
    cardId: z.string().trim().min(1),
    label: z.enum(['relevant', 'irrelevant']),
    labeler: LabelerSchema,
    /**
     * Similaridade (cosseno) da busca entre a situação e o cartão. Só o
     * portão por limiar usa; sem ela, ele não julga o par.
     */
    similarity: z.number().min(-1).max(1).nullable().default(null),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const PairsFileSchema = z
  .object({ description: z.string().optional(), pairs: z.array(PairSchema).min(1) })
  .strict()
  .refine((file) => new Set(file.pairs.map((pair) => pair.id)).size === file.pairs.length, {
    message: 'ids de par repetidos',
  });

export type GatePair = z.infer<typeof PairSchema>;
export type GateSituation = GatePair['situation'];

const CardSchema = z
  .object({
    cardId: z.string().trim().min(1),
    topic: z.string().trim().min(1),
    syndrome: z.enum(PS_SYNDROMES).nullable(),
    content: z
      .object({
        question: z.string().trim().min(1),
        population: z.string().trim().min(1).nullable(),
        answer: z.string().trim().min(1),
        claims: z.array(z.object({ text: z.string().trim().min(1) }).strict()),
      })
      .strict(),
  })
  .strict();

const CardsFileSchema = z
  .object({ description: z.string().optional(), cards: z.array(CardSchema).min(1) })
  .strict();

function formatIssues(filePath: string, error: z.ZodError): Error {
  const issues = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n');
  return new Error(`${filePath} inválido:\n${issues}`);
}

/**
 * Lê e valida os pares. Recusa texto com dado pessoal que a máscara acha
 * (CPF, telefone, e-mail…): o arquivo é versionado e o texto vai para o Jev.
 */
export function loadGatePairs(filePath: string): GatePair[] {
  const parsed = PairsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
  if (!parsed.success) throw formatIssues(filePath, parsed.error);
  const withPii = parsed.data.pairs.filter((pair) =>
    [pair.situation.text, ...pair.situation.hypotheses].some((text) => maskPII(text).hasPII),
  );
  if (withPii.length > 0) {
    throw new Error(
      `${filePath}: dado pessoal no texto da situação (mascare antes): ${withPii.map((pair) => pair.id).join(', ')}`,
    );
  }
  return parsed.data.pairs;
}

export function loadGateCards(filePath: string): RelevanceCard[] {
  const parsed = CardsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
  if (!parsed.success) throw formatIssues(filePath, parsed.error);
  return parsed.data.cards;
}

/** O que o portão recebe da situação, como a análise (CC-408) e a pergunta rápida (CC-501) mandam. */
export function situationContext(situation: GateSituation): CardRelevanceContext {
  return situation.kind === 'quick_question'
    ? { syndrome: null, hypotheses: [situation.text], problemRepresentation: null }
    : {
        syndrome: situation.syndrome,
        hypotheses: situation.hypotheses,
        problemRepresentation: situation.text,
      };
}

/** Pares da mesma situação: julgados numa chamada do portão, como numa análise. */
export interface SituationGroup {
  context: CardRelevanceContext;
  pairs: GatePair[];
}

export function groupBySituation(pairs: readonly GatePair[]): SituationGroup[] {
  const groups = new Map<string, SituationGroup>();
  for (const pair of pairs) {
    const key = JSON.stringify(pair.situation);
    const group = groups.get(key) ?? { context: situationContext(pair.situation), pairs: [] };
    group.pairs.push(pair);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Ids de cartão dos pares sem cartão carregado: erro de digitação ou cartão fora de uso. */
export function missingCards(
  pairs: readonly GatePair[],
  cards: ReadonlyMap<string, RelevanceCard>,
): string[] {
  return [...new Set(pairs.map((pair) => pair.cardId))].filter((cardId) => !cards.has(cardId));
}
