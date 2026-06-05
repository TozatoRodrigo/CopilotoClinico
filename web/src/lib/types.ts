export interface Physician {
  id: string;
  name: string | null;
  email: string;
  crmUf: string;
  crmNumber: string;
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
  interactionId: string;
  output: CopilotOutput;
  citations: Citation[];
  metadata?: Record<string, unknown>;
}

export interface CopilotRecommendation {
  action: string;
  rationale: string;
  citationChunkId: string;
  confidence: number;
}

export interface CopilotOutput {
  reasoning: string;
  recommendations: CopilotRecommendation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

export interface Citation {
  source: string;
  chunkId: string;
  sourceVersion: string;
  text: string;
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
