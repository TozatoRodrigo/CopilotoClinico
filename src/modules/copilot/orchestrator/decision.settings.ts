import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';
import {
  DECISION_PROMPT_VERSIONS,
  KNOWLEDGE_SOURCES,
  type DecisionPromptVersion,
  type KnowledgeSource,
} from '../../../shared/contracts/clinical';
import { readReasoningMode, type ReasoningMode } from '../understanding/understanding.settings';

/**
 * F1 — como a análise raciocina, de onde vem a evidência e qual prompt
 * decide. Lido uma vez por turno, sem redeploy. Os padrões são o pipeline de
 * produção de hoje: `legacy` + `internal_kb` + `v1`.
 */
export interface DecisionPipeline {
  reasoning: ReasoningMode;
  decisionPrompt: DecisionPromptVersion;
  knowledgeSource: KnowledgeSource;
}

export interface DecisionPipelineReading {
  pipeline: DecisionPipeline;
  /** O que a configuração pediu e não pôde valer sem `stages` — vai para o log. */
  downgrades: string[];
}

/** `COPILOT_DECISION_PROMPT`: `v1` (padrão) ou `v2`. Typo cai em `v1`. */
export function readDecisionPromptVersion(config: ConfigService): DecisionPromptVersion {
  return readChoiceFlag(config, 'COPILOT_DECISION_PROMPT', DECISION_PROMPT_VERSIONS, 'v1');
}

/**
 * `COPILOT_KNOWLEDGE_SOURCE`: `internal_kb` (padrão, a busca de sempre),
 * `model_only` (nenhuma busca) ou `web` (pesquisa em fontes oficiais). Typo
 * cai em `internal_kb`: um valor errado nunca liga um caminho não aprovado.
 */
export function readKnowledgeSource(config: ConfigService): KnowledgeSource {
  return readChoiceFlag(config, 'COPILOT_KNOWLEDGE_SOURCE', KNOWLEDGE_SOURCES, 'internal_kb');
}

/**
 * A decisão v2 e a pesquisa web partem do entendimento do caso: sem `stages`,
 * a v2 cede à v1. A pesquisa também precisa da v2 — só ela sabe citar uma
 * página web e rotular a origem; com a v1, a pesquisa seria paga e ignorada.
 * Sem uma das duas, `web` cede a `model_only` — nunca à base interna, que
 * chamaria o provedor de embedding que quem escolheu `web` quer evitar.
 */
export function readDecisionPipeline(config: ConfigService): DecisionPipelineReading {
  const reasoning = readReasoningMode(config);
  const requestedPrompt = readDecisionPromptVersion(config);
  const requestedSource = readKnowledgeSource(config);
  const downgrades: string[] = [];

  const stagesOff = reasoning !== 'stages';
  if (requestedPrompt === 'v2' && stagesOff) {
    downgrades.push('COPILOT_DECISION_PROMPT=v2 exige COPILOT_REASONING=stages: usando v1');
  }
  const decisionPrompt = requestedPrompt === 'v2' && stagesOff ? 'v1' : requestedPrompt;

  const webUnavailable = requestedSource === 'web' && (stagesOff || decisionPrompt !== 'v2');
  if (webUnavailable) {
    downgrades.push(
      'COPILOT_KNOWLEDGE_SOURCE=web exige COPILOT_REASONING=stages e COPILOT_DECISION_PROMPT=v2: seguindo sem busca (model_only)',
    );
  }

  return {
    pipeline: {
      reasoning,
      decisionPrompt,
      knowledgeSource: webUnavailable ? 'model_only' : requestedSource,
    },
    downgrades,
  };
}
