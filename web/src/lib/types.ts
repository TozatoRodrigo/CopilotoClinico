export interface Physician {
  id: string;
  name: string | null;
  email: string;
  crmUf: string;
  crmNumber: string;
  /** false = CRM não verificado contra fonte oficial. Verificação real planejada para R1. */
  crmVerified: boolean;
}

export interface AuthResponse {
  physician: Physician;
}

export interface Encounter {
  id: string;
  physicianId: string;
  patientRef: string;
  vertical: string;
  context: EncounterContext | null;
  status: "draft" | "in_review" | "finalized" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface EncounterContext {
  hasCT: boolean;
  isSus: boolean;
  hasLab: boolean;
  hasICU: boolean;
}

export interface CopilotAnalysis {
  reasoning: string;
  recommendations: CopilotRecommendation[];
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
  clarifyingQuestions: ClarifyingQuestion[];
}

export interface CopilotRecommendation {
  action: string;
  rationale: string;
  citationChunkId: string;
  confidence: number;
  preliminary: boolean;
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

export interface Document {
  id: string;
  encounterId: string;
  physicianId: string;
  type: "soap" | "sbar" | "prescricao" | "alta" | "atestado";
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
