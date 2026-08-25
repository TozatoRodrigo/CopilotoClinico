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
  origin?: 'institutional' | 'public';
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
    latencyMs: number;
    cost: number;
    model: string;
    /** UX-03 — turno desta interação (0 = análise inicial) e teto de turnos. */
    turnIndex: number;
    maxTurns: number;
  };
}

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
