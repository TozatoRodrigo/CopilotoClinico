import type { JsonResponseSchema } from '../../ai-gateway/providers/provider.interface';
import { PS_SYNDROMES } from '../../../shared/contracts/clinical';
import {
  arrayOf,
  BOOLEAN,
  nullable,
  NUMBER,
  oneOf,
  STRING,
  strictObject,
} from '../schemas/json-schema';

/**
 * F1 — JSON Schema do `CaseUnderstandingSchema` (case-understanding.schema.ts)
 * para structured outputs. Só estrutura; limites e regras ficam no zod.
 * case-understanding.json-schema.spec.ts garante a paridade.
 */

const VITALS = strictObject({
  systolicBp: nullable(NUMBER),
  diastolicBp: nullable(NUMBER),
  heartRate: nullable(NUMBER),
  respiratoryRate: nullable(NUMBER),
  spo2: nullable(NUMBER),
  temperature: nullable(NUMBER),
  glucose: nullable(NUMBER),
});

const STRUCTURED_DATA = strictObject({
  age: nullable(NUMBER),
  sex: nullable(oneOf(['F', 'M'])),
  vitals: VITALS,
  onset: nullable(STRING),
  keyFindings: arrayOf(STRING),
  relevantContext: arrayOf(STRING),
});

// F1 — a ordem dos campos é a ordem de geração e segue o método do
// emergencista do system prompt: os dados que o caso dá, a estabilidade, a
// representação do problema, a síndrome e só então as hipóteses, o que falta
// saber e as consultas da busca.
export const CASE_UNDERSTANDING_PROPERTIES = {
  structuredData: STRUCTURED_DATA,
  instability: strictObject({ present: BOOLEAN, findings: arrayOf(STRING) }),
  problemRepresentation: STRING,
  syndrome: oneOf(PS_SYNDROMES),
  syndromeNote: nullable(STRING),
  cannotMiss: arrayOf(
    strictObject({ hypothesis: STRING, whyPlausible: STRING, confirmOrRuleOut: STRING }),
  ),
  likely: arrayOf(strictObject({ hypothesis: STRING, why: STRING })),
  missingDiscriminators: arrayOf(
    strictObject({ data: STRING, separates: arrayOf(STRING), whyItChangesConduct: STRING }),
  ),
  searchQueries: arrayOf(STRING),
  timeCritical: BOOLEAN,
};

export const CASE_UNDERSTANDING_JSON_SCHEMA = {
  name: 'case_understanding',
  schema: strictObject(CASE_UNDERSTANDING_PROPERTIES),
} satisfies JsonResponseSchema;
