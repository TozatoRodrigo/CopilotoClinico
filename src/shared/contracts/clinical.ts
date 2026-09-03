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

export interface CopilotRecommendation {
  action: string;
  rationale: string;
  citationChunkId: string;
  confidence: number;
  preliminary: boolean;
  category?: RecommendationCategory;
  source: string;
  sourceVersion: string;
  sourceText: string;
  sourceUrl: string;
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

export interface Citation {
  source: string;
  sourceVersion: string;
  chunkId: string;
  text: string;
  institutionId?: string | null;
  /**
   * F4 — `physician_attachment` é uma referência que o médico anexou a ESTE
   * atendimento e que ninguém curou. A UI precisa marcar visualmente: a
   * garantia do produto passou a ser "toda recomendação cita uma fonte, e a
   * interface sempre diz se ela é curada", não "toda fonte é curada".
   */
  origin?: 'institutional' | 'public' | 'physician_attachment';
  evidenceFigure?: EvidenceFigure | null;
  evidenceTable?: EvidenceTable | null;
}

export interface CopilotAnalysis {
  reasoning: string;
  redFlags: RedFlag[];
  recommendations: CopilotRecommendation[];
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
  differentials: DifferentialHypothesis[];
  clarifyingQuestions: ClarifyingQuestion[];
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
    latencyMs: number;
    cost: number;
    model: string;
    /** UX-03 — turno desta interação (0 = análise inicial) e teto de turnos. */
    turnIndex: number;
    maxTurns: number;
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
  | { type: 'delta'; delta: string }
  | { type: 'done'; result: CopilotAnalyzeResponse }
  | { type: 'error'; errors: string[] };

export interface LatestInteractionResponse {
  interactionId: string;
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
