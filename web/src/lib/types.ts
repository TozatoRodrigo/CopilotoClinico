export interface Physician {
  id: string;
  name: string | null;
  email: string;
  crmUf: string;
  crmNumber: string;
}

export interface AuthResponse {
  accessToken: string;
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
  recommendations: CopilotRecommendation[];
  citations: Citation[];
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

export interface CopilotRecommendation {
  category: string;
  title: string;
  description: string;
  urgency: "low" | "medium" | "high" | "critical";
  evidenceLevel: string;
}

export interface Citation {
  source: string;
  chunkId: string;
  relevance: number;
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
