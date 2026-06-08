import type { AnalyzeInput } from '../copilot/schemas/copilot.schemas';
import type { OrchestratorResult } from '../copilot/orchestrator/orchestrator.service';

export const INFERENCE_QUEUE = 'inference' as const;

export interface AnalyzeJobData {
  type: 'analyze';
  physicianId: string;
  encounterId: string;
  input: AnalyzeInput;
}

export interface TranscribeJobData {
  type: 'transcribe';
  audioId: string;
  physicianId: string;
  encounterId: string;
}

export type InferenceJobData = AnalyzeJobData | TranscribeJobData;

export interface AnalyzeJobResult extends OrchestratorResult {
  type: 'analyze';
}

export interface TranscribeJobResult {
  type: 'transcribe';
  audioId: string;
  transcript: string;
  analyzeJobId: string;
}

export type InferenceJobResult = AnalyzeJobResult | TranscribeJobResult;

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
