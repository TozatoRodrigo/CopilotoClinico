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

/** `COPILOT_DECISION_PROMPT`: `v1` (padrão), `v2` ou `v3`. Typo cai em `v1`. */
export function readDecisionPromptVersion(config: ConfigService): DecisionPromptVersion {
  return readChoiceFlag(config, 'COPILOT_DECISION_PROMPT', DECISION_PROMPT_VERSIONS, 'v1');
}

/**
 * v2 e v3 decidem a partir do entendimento do caso (Etapa 1) e sabem citar
 * página web e rotular a origem; a v1 não faz nenhuma das duas coisas.
 */
export function isStagedDecisionPrompt(version: DecisionPromptVersion): boolean {
  return version !== 'v1';
}

/**
 * `COPILOT_KNOWLEDGE_SOURCE`: `internal_kb` (padrão, a busca de sempre),
 * `model_only` (nenhuma busca), `web` (pesquisa em fontes oficiais antes da
 * decisão) ou `verify` (decisão sem evidência, conferida em fontes oficiais
 * depois). Typo cai em `internal_kb`: um valor errado nunca liga um caminho
 * não aprovado.
 */
export function readKnowledgeSource(config: ConfigService): KnowledgeSource {
  return readChoiceFlag(config, 'COPILOT_KNOWLEDGE_SOURCE', KNOWLEDGE_SOURCES, 'internal_kb');
}

/**
 * Como a pesquisa de cada fonte que pesquisa aparece no log quando cede:
 * `web` pesquisa antes da decisão; `verify` confere a decisão depois.
 */
const RESEARCH_SOURCE_FALLBACK: Readonly<Record<'web' | 'verify', string>> = {
  web: 'seguindo sem busca (model_only)',
  verify: 'seguindo sem verificação (model_only)',
};

/**
 * As decisões v2 e v3 e as fontes que pesquisam (`web` e `verify`) partem do
 * entendimento do caso: sem `stages`, as decisões cedem à v1. A pesquisa
 * também precisa da v2 ou da v3 — só elas sabem citar uma página web e
 * rotular a origem; com a v1, a pesquisa seria paga e ignorada. Sem uma das
 * duas, `web` e `verify` cedem a `model_only` — nunca à base interna, que
 * chamaria o provedor de embedding que quem escolheu pesquisar quer evitar.
 */
export function readDecisionPipeline(config: ConfigService): DecisionPipelineReading {
  const reasoning = readReasoningMode(config);
  const requestedPrompt = readDecisionPromptVersion(config);
  const requestedSource = readKnowledgeSource(config);
  const downgrades: string[] = [];

  const stagesOff = reasoning !== 'stages';
  const promptUnavailable = isStagedDecisionPrompt(requestedPrompt) && stagesOff;
  if (promptUnavailable) {
    downgrades.push(
      `COPILOT_DECISION_PROMPT=${requestedPrompt} exige COPILOT_REASONING=stages: usando v1`,
    );
  }
  const decisionPrompt = promptUnavailable ? 'v1' : requestedPrompt;

  const researchUnavailable =
    (requestedSource === 'web' || requestedSource === 'verify') &&
    (stagesOff || !isStagedDecisionPrompt(decisionPrompt));
  if (researchUnavailable) {
    downgrades.push(
      `COPILOT_KNOWLEDGE_SOURCE=${requestedSource} exige COPILOT_REASONING=stages e COPILOT_DECISION_PROMPT=v2 ou v3: ${RESEARCH_SOURCE_FALLBACK[requestedSource]}`,
    );
  }

  return {
    pipeline: {
      reasoning,
      decisionPrompt,
      knowledgeSource: researchUnavailable ? 'model_only' : requestedSource,
    },
    downgrades,
  };
}
