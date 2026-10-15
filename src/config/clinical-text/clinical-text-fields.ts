import { Prisma } from '@prisma/client';

/**
 * CC-207 / ADR-020 — inventário das colunas com texto clínico, cifradas em
 * repouso. Fonte única para a extensão do Prisma (cifra na gravação, leitura
 * dupla), para o script de migração em lote e para o `--verify`.
 *
 * `text` são colunas String; `json` são colunas Json, cifradas inteiras como
 * uma string JSON. Os nomes são checados contra o schema pelo compilador; os
 * nomes de tabela e coluna vêm do próprio Prisma (DMMF).
 *
 * Coluna nova com texto do caso ENTRA AQUI. O teste de
 * clinical-text-fields.spec.ts falha enquanto uma coluna String/Json de tabela
 * ligada a um atendimento não estiver classificada aqui ou em
 * PLAINTEXT_BY_DESIGN.
 */

type FieldRefs<M extends Prisma.ModelName> = Prisma.TypeMap['model'][M]['fields'];

type FieldsOfType<M extends Prisma.ModelName, T extends string> = {
  [K in keyof FieldRefs<M>]: FieldRefs<M>[K] extends Prisma.FieldRef<M, T> ? K : never;
}[keyof FieldRefs<M>] &
  string;

interface SealedFieldSpec<M extends Prisma.ModelName> {
  readonly text?: readonly FieldsOfType<M, 'String'>[];
  readonly json?: readonly FieldsOfType<M, 'Json'>[];
}

type SealedFieldRegistry = { readonly [M in Prisma.ModelName]?: SealedFieldSpec<M> };

export const CLINICAL_TEXT_FIELDS = {
  // Caso redigido, motivo da incerteza escrito pelo modelo, saída do modelo
  // (inclusive `raw` das falhas de validação), cópia das recomendações nas
  // citações e respostas do médico às perguntas.
  AiInteraction: {
    text: ['inputRedacted', 'uncertaintyReason'],
    json: ['rawOutput', 'citations', 'answeredQuestions'],
  },
  // ADR-014: caso, leitura do caso, perguntas tiradas do caso e respostas.
  CaseIntake: {
    text: ['caseTextRedacted'],
    json: ['reading', 'questions', 'answers'],
  },
  // Texto extraído do anexo, já mascarado.
  EncounterAttachment: { text: ['text'] },
  // Transcrição do áudio, já mascarada (o áudio já era cifrado).
  AudioCapture: { text: ['transcribedText'] },
  // Queixa principal derivada da análise (título das listas de casos).
  Encounter: { text: ['chiefComplaint'] },
  // SOAP/SBAR/prescrição/alta/atestado e a versão editada pelo médico.
  Document: { json: ['content', 'physicianEdits'] },
  RecommendationDecision: { text: ['note'] },
  CopilotFeedback: { text: ['comment', 'triageNote'] },
  // Respostas do protocolo (há perguntas de texto livre) e o motivo do abandono.
  ProtocolRun: { text: ['abandonReason'], json: ['answers'] },
} as const satisfies SealedFieldRegistry;

/**
 * Colunas String/Json de tabelas ligadas a um atendimento que ficam em claro
 * de propósito, com o motivo. `'*'` cobre a tabela inteira.
 */
export const PLAINTEXT_BY_DESIGN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Encounter: {
    vertical: 'categoria do atendimento (ex.: trauma), não texto do caso',
    context: 'recursos do plantão em booleanos (TC, laboratório, UTI, SUS)',
    patientRef:
      'identificador opaco do HIS (ADR-004), não texto clínico; a busca do Plantão usa contains/insensitive e não funcionaria sobre texto cifrado',
  },
  EncounterAttachment: {
    filename: 'nome do arquivo, mostrado na lista de anexos e gravado na trilha',
    mimeType: 'tipo do arquivo',
  },
  AiInteraction: {
    model: 'metadado',
    requestId: 'metadado',
    retrievedChunkIds: 'ids de trechos de diretriz',
    params:
      'metadados (caso de demonstração, ids das red flags marcadas, cobertura, modelos, rastro da pesquisa); o funil filtra por params.demoCase',
  },
  CaseIntake: {
    context: 'recursos do plantão em booleanos',
    redFlags: 'ids das red flags marcadas',
    demoCase: 'id do caso de demonstração',
    readingModel: 'metadado',
  },
  RecommendationDecision: { recommendationKey: 'índice + 12 hex do SHA-256 da ação' },
  Document: {
    pdfObjectKey: 'chave do PDF no storage',
    contentHash: 'SHA-256 do conteúdo EM CLARO (selo do documento)',
  },
  AudioCapture: {
    encryptedContent: 'já cifrado pelo CryptoService (formato legado iv:tag:ct)',
    mimeType: 'tipo do arquivo',
    jobId: 'id do job na fila',
  },
  AiCall: { '*': 'só metadados da chamada de IA, por desenho (sem texto do caso)' },
};

/**
 * Texto que `OrchestratorService.settleAnalysis` grava em `uncertainty_reason`
 * na linha de falha de validação. É constante do sistema, não texto clínico.
 */
export const VALIDATION_FAILED_REASON = 'Output validation failed';

/**
 * Valores fixos do sistema que ficam em claro dentro de uma coluna cifrada,
 * para continuarem filtráveis por igualdade. O marcador da falha de validação
 * separa análises de falhas ("a última análise" filtra
 * `uncertaintyReason not 'Output validation failed'`); o motivo escrito pelo
 * modelo continua cifrado.
 */
export const PLAINTEXT_MARKERS: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  AiInteraction: { uncertaintyReason: [VALIDATION_FAILED_REASON] },
};

export type ClinicalTextModel = keyof typeof CLINICAL_TEXT_FIELDS;

export type SealedFieldKind = 'text' | 'json';

export interface SealedColumn {
  model: ClinicalTextModel;
  field: string;
  kind: SealedFieldKind;
  /** Nome da tabela no banco. */
  table: string;
  /** Nome da coluna no banco. */
  column: string;
  /** Valores do sistema gravados em claro (ver PLAINTEXT_MARKERS). */
  markers: readonly string[];
}

const datamodel = Prisma.dmmf.datamodel.models;

function dmmfModel(name: string) {
  const model = datamodel.find((candidate) => candidate.name === name);
  if (!model) throw new Error(`Unknown Prisma model ${name}`);
  return model;
}

function sealedColumn(
  model: ClinicalTextModel,
  field: string,
  kind: SealedFieldKind,
): SealedColumn {
  const dmmf = dmmfModel(model);
  const dmmfField = dmmf.fields.find((candidate) => candidate.name === field);
  if (!dmmfField) throw new Error(`Unknown field ${model}.${field}`);
  return {
    model,
    field,
    kind,
    table: dmmf.dbName ?? dmmf.name,
    column: dmmfField.dbName ?? dmmfField.name,
    markers: PLAINTEXT_MARKERS[model]?.[field] ?? [],
  };
}

/** Todas as colunas cifradas, na ordem do inventário. */
export const SEALED_COLUMNS: readonly SealedColumn[] = Object.entries(CLINICAL_TEXT_FIELDS).flatMap(
  ([model, spec]) => {
    const name = model as ClinicalTextModel;
    const fields = spec as { text?: readonly string[]; json?: readonly string[] };
    return [
      ...(fields.text ?? []).map((field) => sealedColumn(name, field, 'text')),
      ...(fields.json ?? []).map((field) => sealedColumn(name, field, 'json')),
    ];
  },
);

const SEALED_FIELDS_BY_MODEL: ReadonlyMap<string, ReadonlyMap<string, SealedColumn>> = new Map(
  Object.keys(CLINICAL_TEXT_FIELDS).map((model) => [
    model,
    new Map(
      SEALED_COLUMNS.filter((column) => column.model === model).map((column) => [
        column.field,
        column,
      ]),
    ),
  ]),
);

/** Campos cifrados de um modelo, por nome de campo do Prisma. */
export function sealedFieldsOf(model: string): ReadonlyMap<string, SealedColumn> | undefined {
  return SEALED_FIELDS_BY_MODEL.get(model);
}

/** Campos de relação de cada modelo → modelo relacionado (para filtros e escritas aninhadas). */
export const RELATIONS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(
  datamodel.map((model) => [
    model.name,
    new Map(
      model.fields
        .filter((field) => field.kind === 'object')
        .map((field) => [field.name, field.type]),
    ),
  ]),
);
