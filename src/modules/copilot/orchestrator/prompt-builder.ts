export interface RetrievedContext {
  chunkId: string;
  text: string;
  source: string;
  sourceVersion: string;
  score: number;
}

export interface EncounterContext {
  hasCT: boolean;
  isSus: boolean;
  hasLab: boolean;
  hasICU: boolean;
}

export interface PromptInput {
  caseText: string;
  retrievedChunks: RetrievedContext[];
  context: EncounterContext;
  vertical?: string;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  retrievedChunkIds: string[];
}

const SYSTEM_INSTRUCTION = `You are a clinical co-pilot for emergency medicine physicians in Brazil. You assist with clinical reasoning, NEVER replace the physician's judgment.

MANDATORY RULES:
1. Every clinical recommendation MUST reference a specific guideline chunk using the citationChunkId field.
2. If the retrieved evidence does not cover the clinical scenario, you MUST set "uncertainty" to true and "uncertaintyReason" to describe what is missing.
3. NEVER fabricate or hallucinate guideline references. Only cite chunks that were actually provided.
4. NEVER produce output directed at the patient. This system is physician-to-physician only.
5. Output MUST be valid JSON matching the required schema exactly.
6. If you are unsure, declare uncertainty. False confidence is dangerous.

OUTPUT SCHEMA (respond with valid JSON only):
{
  "reasoning": "string - your clinical reasoning process",
  "recommendations": [
    {
      "action": "string - specific clinical action",
      "rationale": "string - why this action is recommended",
      "citationChunkId": "string - MUST be one of the provided chunk IDs",
      "confidence": "number 0-1"
    }
  ],
  "uncertainty": "boolean",
  "uncertaintyReason": "string or null"
}`;

export function buildPrompt(input: PromptInput): BuiltPrompt {
  if (input.retrievedChunks.length === 0) {
    return {
      system: SYSTEM_INSTRUCTION,
      user: buildCaseOnlyUser(input),
      retrievedChunkIds: [],
    };
  }

  const evidenceBlock = input.retrievedChunks
    .map(
      (chunk) =>
        `[ID: ${chunk.chunkId}] [Source: ${chunk.source} v${chunk.sourceVersion}]\n${chunk.text}`,
    )
    .join('\n\n---\n\n');

  const contextLines: string[] = [];
  if (input.context.hasCT) contextLines.push('- Tomografia disponível');
  if (input.context.isSus) contextLines.push('- Paciente SUS');
  if (input.context.hasLab) contextLines.push('- Laboratório disponível');
  if (input.context.hasICU) contextLines.push('- UTI disponível');
  const contextBlock =
    contextLines.length > 0 ? `Recursos disponíveis:\n${contextLines.join('\n')}` : '';

  const user = `<clinical_case type="UNTRUSTED_INPUT">
${input.caseText}
</clinical_case>

<guideline_evidence type="TRUSTED_CURATED_SOURCE">
${evidenceBlock}
</guideline_evidence>
${contextBlock ? `\n${contextBlock}\n` : ''}
Analyze this case and provide structured recommendations with citations.`;

  return {
    system: SYSTEM_INSTRUCTION,
    user,
    retrievedChunkIds: input.retrievedChunks.map((c) => c.chunkId),
  };
}

function buildCaseOnlyUser(input: PromptInput): BuiltPrompt['user'] {
  return `<clinical_case type="UNTRUSTED_INPUT">
${input.caseText}
</clinical_case>

WARNING: No relevant guideline evidence was found for this case. Set uncertainty to true.

Analyze this case and declare evidence insufficiency.`;
}
