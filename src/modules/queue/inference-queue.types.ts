import type { AnalyzeInput } from '../copilot/schemas/copilot.schemas';

export const INFERENCE_QUEUE = 'inference' as const;

/**
 * CC-011 — o job leva só referências. O caso, já redigido, fica no banco
 * (`case_intakes`, a conversa do copiloto guiado) e o worker o lê de lá:
 * nenhum texto clínico no Redis.
 */
export interface AnalyzeJobData {
  type: 'analyze';
  physicianId: string;
  encounterId: string;
  intakeId: string;
}

export interface TranscribeJobData {
  type: 'transcribe';
  audioId: string;
  physicianId: string;
  encounterId: string;
}

/** O que se enfileira daqui em diante. */
export type InferenceJobData = AnalyzeJobData | TranscribeJobData;

/**
 * Job enfileirado antes do CC-011 (ainda pode estar no Redis no deploy): o
 * pedido inteiro, com o caso sem redação.
 */
export interface LegacyAnalyzeJobData {
  type: 'analyze';
  physicianId: string;
  encounterId: string;
  input: AnalyzeInput;
}

/** O mesmo job antigo depois que o worker tirou o texto do Redis. */
export type StrippedLegacyAnalyzeJobData = Omit<LegacyAnalyzeJobData, 'input'>;

export type StoredAnalyzeJobData =
  | AnalyzeJobData
  | LegacyAnalyzeJobData
  | StrippedLegacyAnalyzeJobData;

/** O que o worker pode achar no Redis. */
export type StoredInferenceJobData = StoredAnalyzeJobData | TranscribeJobData;

/**
 * CC-011 — o resultado também fica no Redis (24 h): só ids. O plano sai por
 * `GET .../copilot/conversation` ou `GET .../copilot/latest`.
 */
export interface AnalyzeJobResult {
  type: 'analyze';
  intakeId: string;
  interactionId: string;
}

export interface TranscribeJobResult {
  type: 'transcribe';
  audioId: string;
  analyzeJobId: string;
}

export type InferenceJobResult = AnalyzeJobResult | TranscribeJobResult;

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
