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

export interface Physician {
  id: string;
  name: string | null;
  email: string;
  crmUf: string;
  crmNumber: string;
  crmVerified: boolean;
}

export interface AuthResponse {
  physician: Physician;
}

export interface CreateEncounterRequest {
  patientRef: string;
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
  patientRef: string;
  status: EncounterStatus;
  createdAt: string;
  updatedAt: string;
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
  aiInteractionId: string;
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
}

export interface DifferentialHypothesis {
  hypothesis: string;
  whyConsider: string;
  whatDistinguishes: string;
}

export type ClarifyingAnswerValue = string | number | boolean;

export interface ClarifyingAnswer {
  questionId: string;
  answer: ClarifyingAnswerValue;
}

export interface Citation {
  source: string;
  sourceVersion: string;
  chunkId: string;
  text: string;
  institutionId?: string | null;
  origin?: 'institutional' | 'public';
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
  };
}

export interface LatestInteractionResponse {
  interactionId: string;
  output: Omit<CopilotAnalysis, 'citations' | 'uncertainty' | 'uncertaintyReason'>;
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
  createdAt: string;
}
