export const encounterVerticalValues = [
  'trauma',
  'cardiac',
  'pediatric',
  'neuro',
  'general',
] as const;

export type EncounterVertical = (typeof encounterVerticalValues)[number];

export const encounterStatusValues = ['draft', 'in_review', 'finalized', 'cancelled'] as const;

export type EncounterStatus = (typeof encounterStatusValues)[number];

export const documentTypeValues = ['soap', 'sbar', 'prescricao', 'alta', 'atestado'] as const;

export type DocumentType = (typeof documentTypeValues)[number];

/**
 * F0-D — campo do conteúdo de SOAP, SBAR e Alta que guarda o registro de uso
 * de IA (Res. CFM 2.454/2026). Não editável pelo médico; o texto vive em
 * src/modules/documents/ai-use-record.ts.
 */
export const AI_USE_RECORD_FIELD = 'aiUseRecord';

export interface EncounterContext {
  hasCT: boolean;
  isSus: boolean;
  hasLab: boolean;
  hasICU: boolean;
}

export type PhysicianRole = 'PHYSICIAN' | 'COMPLIANCE' | 'ADMIN';

export interface Physician {
  id: string;
  name: string | null;
  email: string;
  crmUf: string;
  crmNumber: string;
  crmVerified: boolean;
  role: PhysicianRole;
  mfaEnabled?: boolean;
  // PI-05 — preferência de idioma persistida na conta ('pt-BR' | 'es'), não
  // apenas no localStorage do dispositivo. Tipado como `string` (não como a
  // união `Locale` do web/) porque este contrato é consumido pelo backend,
  // que não deve depender do conjunto de dicionários que o front shippa;
  // web/src/lib/messages/use-messages.ts é quem valida contra os locales
  // suportados antes de resolver o dicionário.
  locale?: string;
}

export interface AuthResponse {
  physician: Physician;
}

export interface CreateEncounterRequest {
  // S25-QC-01 — opcional: sem identificação, o caso nasce como "consulta
  // rápida" e fica de fora da fila do Plantão até ser identificado depois
  // (PATCH /encounters/:id). Ver EncountersService.findByPhysician.
  patientRef?: string;
  vertical: EncounterVertical;
  institutionId?: string;
  context: EncounterContext;
}

export interface CreateEncounterResponse {
  id: string;
}

export interface EncounterSummary {
  id: string;
  vertical: string;
  /**
   * S25-QC-01 — `null` quando o encontro é uma "consulta rápida" (paciente
   * ainda não identificado). Por padrão, `GET /encounters` já filtra essas
   * consultas fora da fila do Plantão — `null` só aparece aqui se o
   * chamador pedir explicitamente `includeUnidentified: true`.
   */
  patientRef: string | null;
  /**
   * RD-E7 — queixa principal derivada automaticamente da 1ª análise de IA
   * (ver OrchestratorService.analyze/analyzeStream); `null` até o encontro
   * ter uma análise. A UI usa isto como título dos cards no lugar de
   * `patientRef` quando disponível: `chiefComplaint ?? patientRef`.
   */
  chiefComplaint: string | null;
  status: EncounterStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * PI-01 — maior severidade de red flag da interação de IA MAIS RECENTE
   * deste encontro (não o histórico inteiro — reflete o estado clínico
   * atual, não achados já resolvidos em turnos anteriores). `null` quando
   * o caso ainda não tem nenhuma análise.
   */
  highestRedFlagSeverity: RedFlagSeverity | null;
  /** Timestamp da última interação de IA; null se ainda não analisado (usar createdAt do encontro como fallback na UI). */
  lastInteractionAt: string | null;
}

export interface EncounterAiInteractionSummary {
  id: string;
  model: string;
  uncertainty: boolean;
  uncertaintyReason: string | null;
  latencyMs: number;
  cost: number;
  createdAt: string;
}

export interface EncounterDocumentSummary {
  id: string;
  type: DocumentType;
  confirmedBy: string | null;
  confirmedAt: string | null;
  contentHash: string | null;
  createdAt: string;
}

export interface EncounterDetail extends EncounterSummary {
  physicianId: string;
  institutionId: string | null;
  context: EncounterContext;
  aiInteractions: EncounterAiInteractionSummary[];
  documents: EncounterDocumentSummary[];
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
}

export interface EncountersResponse {
  data: EncounterSummary[];
  meta: PaginatedMeta;
}

export interface DashboardStats {
  todayCount: number;
  pendingReviews: number;
  confirmedDocuments: number;
}

export interface GenerateDocumentRequest {
  type: DocumentType;
  // RD-E7 — opcional: sem ele, o backend usa a interação de IA mais recente
  // do encontro (ver generateDocumentSchema / DocumentsService.generate).
  aiInteractionId?: string;
}

export interface EditDocumentRequest {
  physicianEdits: Record<string, unknown>;
}

export interface Document {
  id: string;
  encounterId: string;
  physicianId: string;
  type: DocumentType;
  content: Record<string, unknown>;
  physicianEdits: Record<string, unknown> | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  beforeHash: string | null;
  afterHash: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditQueryResponse {
  items: AuditEntry[];
  total: number;
}

export type RecommendationCategory = 'stabilization' | 'diagnostic' | 'therapeutic' | 'verify';

export type RedFlagSeverity = 'critical' | 'high' | 'moderate';

export interface RedFlag {
  finding: string;
  severity: RedFlagSeverity;
  action: string;
}

/**
 * F0-C — por que uma recomendação saiu preliminar.
 *
 * - `pending_questions`: marcada pelo modelo (perguntas em aberto, red flag
 *   crítica, anexo do médico). É o significado histórico de `preliminary`.
 * - `unreviewed_source`: cita fonte que nenhum médico com CRM verificado
 *   assinou — base oficial do MS ou chunk curado sem assinatura (ADR-012).
 * - `subtype_ambiguity`: a evidência recuperada cobre ≥2 subtipos do mesmo
 *   cenário com conduta oposta e a recomendação cita um deles.
 */
export type PreliminaryReason = 'pending_questions' | 'unreviewed_source' | 'subtype_ambiguity';

export interface CopilotRecommendation {
  action: string;
  rationale: string;
  citationChunkId: string;
  /**
   * Autodeclarada pelo modelo. Fica no contrato (ordenação, SBAR, auditoria),
   * mas a UI não mostra: decisão clínica de não exibir probabilidade (F0-C).
   */
  confidence: number;
  preliminary: boolean;
  /**
   * F0-C — presente quando `preliminary` é true. Opcional: interações
   * gravadas antes do campo não o têm, e a UI as trata como
   * `pending_questions` (o texto de sempre).
   */
  preliminaryReason?: PreliminaryReason;
  category?: RecommendationCategory;
  source: string;
  sourceVersion: string;
  sourceText: string;
  sourceUrl: string;
  /**
   * Origem da fonte citada — ver `Citation.origin`. Opcional: análises
   * gravadas antes deste campo não o têm, e a UI não afirma origem que não foi
   * registrada.
   */
  origin?: Citation['origin'];
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  why: string;
  criticality: 'blocker' | 'important' | 'optional';
  expectedAnswerType: 'boolean' | 'choice' | 'number' | 'text';
  choices?: string[];
  /**
   * UX-01 — finalidade clínica que agrupa esta pergunta na UI (ex:
   * "Estabilidade hemodinâmica", "Tempo de evolução"), no padrão "Dados
   * necessários para uma análise segura" elogiado na reunião com os
   * médicos piloto. Opcional e preenchido pelo modelo — quando ausente,
   * o front degrada graciosamente para lista simples sem agrupamento.
   */
  purpose?: string;
}

export interface DifferentialHypothesis {
  hypothesis: string;
  whyConsider: string;
  whatDistinguishes: string;
  /**
   * PI-03 — "não pode perder": mesmo critério de um red flag `critical`
   * (risco de morte ou dano irreversível em minutos a horas). Deliberadamente
   * binário — sem número de probabilidade, decisão do Dr. Gustavo em
   * reunião ("médico trabalha muito mal com probabilidades").
   */
  cannotMiss: boolean;
  /** Só presente quando cannotMiss=true. Nunca um número — ver cannotMiss. */
  timeToHarm?: 'minutos' | 'horas' | 'dias';
}

export type ClarifyingAnswerValue = string | number | boolean;

export interface ClarifyingAnswer {
  questionId: string;
  answer: ClarifyingAnswerValue;
}

export interface EvidenceFigure {
  url: string;
  caption?: string;
}

export interface EvidenceTable {
  caption?: string;
  columns: string[];
  rows: string[][];
}

/**
 * F4 — `physician_attachment` é uma referência que o médico anexou a ESTE
 * atendimento e que ninguém curou. A UI precisa marcar visualmente: a
 * garantia do produto passou a ser "toda recomendação cita uma fonte, e a
 * interface sempre diz se ela é curada", não "toda fonte é curada".
 *
 * ADR-010 — `official_unreviewed` é documento oficial do Ministério da Saúde
 * (PCDT/DDT/Diretrizes/Protocolos de Uso) ainda não revisado pela equipe
 * clínica. Também precisa de marca visual própria.
 *
 * ADR-012 — `curated_unsigned` é chunk da base curada (`approved`) que nenhum
 * médico com CRM verificado assinou: seed, pacotes KB-003/KB-004 e ingestão
 * interna. `institutional`/`public` passam a significar "curado E assinado".
 */
export type CitationOrigin =
  | 'institutional'
  | 'public'
  | 'physician_attachment'
  | 'official_unreviewed'
  | 'curated_unsigned';

export interface Citation {
  source: string;
  sourceVersion: string;
  chunkId: string;
  text: string;
  institutionId?: string | null;
  origin?: CitationOrigin;
  evidenceFigure?: EvidenceFigure | null;
  evidenceTable?: EvidenceTable | null;
}

/**
 * F1 — síndromes de pronto-socorro: como o paciente se APRESENTA, não o
 * diagnóstico final. Fonte única da lista fechada: o entendimento do caso
 * (ADR-013, Etapa 1) escolhe uma delas e o gabarito clínico estratifica os
 * casos por elas (evals/clinical/case.schema.ts). Lista fechada para os
 * estratos não se fragmentarem por sinônimo; `outro` existe só para o
 * entendimento, com a descrição em `syndromeNote`.
 */
export const PS_SYNDROMES = [
  'agitacao-psicomotora',
  'cefaleia',
  'choque',
  'crise-convulsiva',
  'deficit-neurologico-focal',
  'diarreia-vomitos',
  'disturbio-glicemico',
  'dispneia',
  'dor-abdominal',
  'dor-lombar-flanco',
  'dor-toracica',
  'febre',
  'febre-hipotensao',
  'infeccao-respiratoria',
  'intoxicacao',
  'pele-partes-moles',
  'pressao-arterial-elevada',
  'reacao-alergica',
  'rebaixamento-consciencia',
  'sintomas-urinarios',
  'vertigem',
  'outro',
] as const;

export type PsSyndrome = (typeof PS_SYNDROMES)[number];

/**
 * F1 — Etapa 1 do raciocínio em etapas (ADR-013): o que o Copiloto entendeu
 * do caso ANTES de buscar evidência ou recomendar. Vai para a tela ("O que eu
 * entendi") para o médico conferir e corrigir.
 */
export interface CaseUnderstanding {
  /** Uma linha com os qualificadores que mudam a conduta. */
  problemRepresentation: string;
  /** Só o que o texto do caso informa; dado não informado é `null`, nunca inferido. */
  structuredData: {
    age: number | null;
    sex: 'F' | 'M' | null;
    vitals: {
      systolicBp: number | null;
      diastolicBp: number | null;
      heartRate: number | null;
      respiratoryRate: number | null;
      spo2: number | null;
      temperature: number | null;
      glucose: number | null;
    };
    /** Início / tempo de evolução, como o texto disse. */
    onset: string | null;
    keyFindings: string[];
    /** Anticoagulante, gestação, imunossupressão, alergias… só se informado. */
    relevantContext: string[];
  };
  instability: { present: boolean; findings: string[] };
  syndrome: PsSyndrome;
  /** Preenchida quando `syndrome` é `outro`. */
  syndromeNote: string | null;
  /** Do pior para o menos grave, no máximo 5. */
  cannotMiss: Array<{ hypothesis: string; whyPlausible: string; confirmOrRuleOut: string }>;
  /** No máximo 3. */
  likely: Array<{ hypothesis: string; why: string }>;
  /** Dados ausentes que separam hipóteses de conduta diferente, no máximo 4. */
  missingDiscriminators: Array<{ data: string; separates: string[]; whyItChangesConduct: string }>;
  /** Consultas da busca dirigida, de 1 a 4. */
  searchQueries: string[];
}

/**
 * F1 — `questionId` reservado de POST /copilot/respond para o médico corrigir
 * o entendimento. O backend o mostra no bloco de perguntas e respostas como
 * "Correção do médico ao entendimento".
 */
export const UNDERSTANDING_CORRECTION_QUESTION_ID = 'correcao-do-entendimento';

export interface CopilotAnalysis {
  reasoning: string;
  redFlags: RedFlag[];
  recommendations: CopilotRecommendation[];
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
  differentials: DifferentialHypothesis[];
  clarifyingQuestions: ClarifyingQuestion[];
  /**
   * F1 — Etapa 1 (ADR-013). Ausente com `COPILOT_REASONING=legacy` e em
   * interações gravadas antes da Fase 1; `null` quando a etapa falhou e a
   * análise seguiu pelo caminho de sempre. A UI só mostra o card com valor.
   */
  understanding?: CaseUnderstanding | null;
}

export interface CopilotAnalyzeResponse {
  interactionId: string;
  output: CopilotAnalysis;
  citations: Citation[];
  metadata: {
    piiDetected: boolean;
    injectionDetected: boolean;
    chunksRetrieved: number;
    /**
     * KB-005/KB-006 — o quanto a base de diretrizes cobre este caso.
     * `full`: encaixe forte. `partial`: a evidência passou no piso de
     * relevância mas não é um encaixe forte — o modelo foi avisado disso.
     * `none`: nenhum chunk passou no piso; a análise não recomendou citando o
     * cenário vizinho, declarou a lacuna e perguntou. A UI mostra isso ao
     * médico para que a ausência de recomendação seja lida como "a base não
     * cobre este cenário", não como indecisão do modelo.
     */
    retrievalCoverage: RetrievalCoverage;
    /**
     * ADR-010 — trechos da base oficial do MS entregues ao modelo. Opcional:
     * respostas anteriores à base oficial não têm o campo.
     */
    officialChunksRetrieved?: number;
    latencyMs: number;
    cost: number;
    model: string;
    /** UX-03 — turno desta interação (0 = análise inicial) e teto de turnos. */
    turnIndex: number;
    maxTurns: number;
    /** F1 — duração da Etapa 1 (entendimento). Só com `COPILOT_REASONING=stages`. */
    understandingLatencyMs?: number;
  };
}

/** KB-005/KB-006 — ver CopilotAnalyzeResponse.metadata.retrievalCoverage. */
export type RetrievalCoverage = 'full' | 'partial' | 'none';

/**
 * UX-06 — eventos do stream SSE de GET /encounters/:id/copilot/stream.
 * Espelha `StreamEvent` de orchestrator.service.ts, mas com `result`
 * tipado como `CopilotAnalyzeResponse` (o formato de wire real que a HTTP
 * API expõe) em vez de `OrchestratorResult` (tipo interno do backend) —
 * mesma convenção de CopilotAnalyzeResponse espelhando OrchestratorResult.
 */
export type CopilotStreamEvent =
  /** F1 — Etapa 1 pronta, antes do primeiro delta (só com `COPILOT_REASONING=stages`). */
  | { type: 'understanding'; understanding: CaseUnderstanding }
  | { type: 'delta'; delta: string }
  | { type: 'done'; result: CopilotAnalyzeResponse }
  | { type: 'error'; errors: string[] };

export interface LatestInteractionResponse {
  interactionId: string;
  /**
   * Texto do caso como foi analisado (já com PII mascarada; em turnos
   * seguintes inclui as respostas do médico). Alimenta a consulta de
   * diretrizes dentro do caso — buscar pelo que o médico descreveu, não pelo
   * raciocínio do modelo. `null` em interações sem texto gravado.
   */
  caseText: string | null;
  output: Omit<CopilotAnalysis, 'citations' | 'uncertainty' | 'uncertaintyReason'>;
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
  createdAt: string;
  /** UX-03 — ver CopilotAnalyzeResponse.metadata.turnIndex/maxTurns. */
  turnIndex: number;
  maxTurns: number;
  /**
   * KB-005/KB-006 — ver CopilotAnalyzeResponse.metadata.retrievalCoverage.
   * `null` em interações gravadas antes desta mudança: a UI não mostra o
   * aviso de cobertura em vez de assumir que a base cobria o caso.
   */
  retrievalCoverage: RetrievalCoverage | null;
}

/**
 * F7 — feedback estruturado do médico sobre uma análise.
 *
 * `wrong_scenario` é o caso dos dois incidentes de campo: o Copiloto conduziu
 * para o cenário clínico errado. `missing_coverage` é o cenário certo sem
 * diretriz na base. `helpful` existe para dar contraste na calibração do piso
 * de relevância — sem exemplos positivos não dá para escolher o limiar.
 */
export type CopilotFeedbackKind =
  | 'wrong_scenario'
  | 'missing_coverage'
  | 'wrong_recommendation'
  | 'helpful';

export interface CopilotFeedbackRequest {
  interactionId: string;
  kind: CopilotFeedbackKind;
  comment?: string;
}

export interface CopilotFeedbackResponse {
  recorded: true;
}

/**
 * F0-D — fila de triagem do feedback (console admin, curadoria).
 * `converted_to_eval_case` = virou caso do gabarito de avaliação.
 */
export const copilotFeedbackStatusValues = [
  'new',
  'triaged',
  'converted_to_eval_case',
  'dismissed',
] as const;

export type CopilotFeedbackStatus = (typeof copilotFeedbackStatusValues)[number];

/** Visão compacta da saída da análise — o que a curadoria precisa para triar. */
export interface CopilotFeedbackOutputSummary {
  mainHypothesis: string | null;
  recommendations: Array<{ action: string; preliminary: boolean; citationChunkId: string | null }>;
  questions: Array<{ question: string; criticality: string }>;
  uncertainty: boolean;
}

export interface CopilotFeedbackTriageItem {
  id: string;
  kind: CopilotFeedbackKind;
  /** Comentário do médico, já mascarado de PII. */
  comment: string | null;
  status: CopilotFeedbackStatus;
  triageNote: string | null;
  triagedBy: string | null;
  triagedAt: string | null;
  createdAt: string;
  encounterId: string;
  physicianId: string;
  interaction: {
    id: string;
    model: string;
    turnIndex: number;
    /** Texto do caso como foi analisado (PII mascarada). */
    inputRedacted: string | null;
    retrievalCoverage: RetrievalCoverage | null;
    retrievedChunkIds: string[];
    citedChunkIds: string[];
    output: CopilotFeedbackOutputSummary;
    createdAt: string;
  };
}

export interface CopilotFeedbackTriagePage {
  items: CopilotFeedbackTriageItem[];
  /** Total do filtro atual (para paginação). */
  total: number;
  /** Total por status, independente do filtro (contadores das abas). */
  countsByStatus: Record<CopilotFeedbackStatus, number>;
}

export interface UpdateCopilotFeedbackTriageRequest {
  status: CopilotFeedbackStatus;
  /** Texto livre da curadoria; o servidor mascara PII. `null` apaga. */
  triageNote?: string | null;
}

/**
 * F0-D — o que o médico fez com uma recomendação, persistido no servidor
 * (antes vivia só no sessionStorage). `modified` = adotou com ajuste (Adotar
 * + nota); a regra completa de mapeamento dos botões está em
 * web/src/hooks/use-recommendation-decisions.ts.
 */
export const recommendationDecisionValues = ['adopted', 'rejected', 'modified'] as const;

export type RecommendationDecisionValue = (typeof recommendationDecisionValues)[number];

/**
 * O cliente manda o ÍNDICE da recomendação, não a chave: o servidor calcula
 * `recommendationKey` a partir do rawOutput gravado, para que uma chave
 * forjada nunca aponte para uma recomendação que não existe.
 */
export interface UpsertRecommendationDecisionRequest {
  interactionId: string;
  recommendationIndex: number;
  decision: RecommendationDecisionValue;
  /** Texto livre; o servidor mascara PII antes de gravar. `null` apaga a nota. */
  note?: string | null;
}

export interface RecommendationDecisionRecord {
  id: string;
  interactionId: string;
  recommendationIndex: number;
  /** `<índice>-<12 hex do sha256 da ação>`. */
  recommendationKey: string;
  decision: RecommendationDecisionValue;
  /** Nota já mascarada de PII. */
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * F4 — sugestão de diretriz enviada por um médico do piloto.
 *
 * Metadados de curadoria (`sourceVersion`, `specialty`) são opcionais de
 * propósito: exigir front-matter completo foi o que impediu um médico de
 * contribuir com a diretriz de dengue depois de ver um caso ir para o
 * caminho errado. O backend aplica defaults.
 */
export interface SuggestGuidelineRequest {
  text: string;
  source: string;
  sourceVersion?: string;
  specialty?: string;
  evidenceLevel?: string;
  cenario?: string;
  redFlags?: string[];
  subtipo?: string;
}

/**
 * F4 — extração de texto de um arquivo, no servidor, antes de sugerir.
 * O médico confere e recorta o texto: um artigo de 47 páginas inteiro viraria
 * dezenas de chunks de contexto irrelevante competindo no retrieval.
 */
export type ExtractableDocumentMime =
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'text/x-markdown';

export interface ExtractDocumentTextRequest {
  mimeType: ExtractableDocumentMime;
  filename?: string;
  /** Conteúdo do arquivo em base64. */
  data: string;
}

export interface ExtractDocumentTextResponse {
  text: string;
  /** Número de páginas quando a origem é PDF; `null` para texto puro. */
  pages: number | null;
  /** `true` quando o texto foi cortado no teto — o médico precisa saber. */
  truncated: boolean;
}

export interface SuggestGuidelineResponse {
  source: string;
  sourceVersion: string;
  chunksCreated: number;
  /** Sempre 0: sugestão nunca supersede conteúdo aprovado. */
  superseded: number;
}

/**
 * F4 — referência anexada pelo médico a um atendimento. Diferente de sugerir
 * para a base (SuggestGuidelineRequest): vale só para este caso, não passa por
 * curadoria e não afeta nenhum outro médico.
 */
export interface EncounterAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CreateAttachmentRequest {
  filename: string;
  mimeType: ExtractableDocumentMime;
  sizeBytes: number;
  /** Conteúdo do arquivo em base64. */
  data: string;
}

export interface CreateAttachmentResponse extends EncounterAttachment {
  /** `true` quando o texto foi cortado no teto de contexto. */
  truncated: boolean;
}

// ── Admin / Console types (E1, E2, E5) ─────────────────────────────────────

export type CrmVerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CrmVerificationItem {
  id: string;
  physicianId: string;
  status: CrmVerificationStatus;
  notes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  requestedAt: string;
  physician: {
    id: string;
    name: string | null;
    crmUf: string;
    crmNumber: string;
    email: string;
  };
}

export interface ResolveCrmVerificationRequest {
  action: 'approve' | 'reject';
  notes?: string;
}

export interface GuidelineSourceSummary {
  source: string;
  sourceVersion: string;
  chunkCount: number;
  active: boolean;
  validFrom: string;
  validTo: string | null;
}

export interface PendingGuidelineChunk {
  id: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel: string | null;
  text: string;
  metadata: unknown;
  createdAt: string;
}

/**
 * Consulta de diretrizes dentro do caso: busca por significado e por
 * palavra-chave nas bases curada e oficial (ADR-010), agrupada por documento.
 * POST, não GET: o texto pode ser o caso inteiro, e query string vai para o
 * log de acesso.
 */
export interface GuidelineConsultRequest {
  query: string;
  limit?: number;
}

export interface GuidelineConsultResult {
  chunkId: string;
  source: string;
  sourceVersion: string;
  /** Seção do documento oficial ("7. TRATAMENTO"); `null` na base curada. */
  section: string | null;
  text: string;
  origin: NonNullable<Citation['origin']>;
  /** PDF oficial (base oficial); `null` na base curada. */
  documentUrl: string | null;
  specialty: string;
  /** Similaridade de cosseno com a consulta (0–1). */
  similarity: number;
  matchedBy: 'semantic' | 'keyword' | 'both';
}

export interface GuidelineConsultResponse {
  results: GuidelineConsultResult[];
}

export interface GuidelineSearchResult {
  id: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel: string | null;
  text: string;
  metadata: unknown;
  validFrom: string;
  institutionId: string | null;
  reviewerName: string | null;
  rank: number;
}
