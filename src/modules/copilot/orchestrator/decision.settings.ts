import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag, readChoiceFlag } from '../../../config/feature-flag';
import {
  DECISION_PROMPT_VERSIONS,
  KNOWLEDGE_SOURCES,
  type CaseUnderstanding,
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
  /**
   * CC-601 — linha de "por quê" em cada conduta "agora" (`COPILOT_WHY_LINE`).
   * Só vale com `decisionPrompt` v3 ou v4 (`supportsWhyLine`).
   */
  whyLine: boolean;
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
export function isStagedDecisionPrompt(
  version: DecisionPromptVersion,
): version is Exclude<DecisionPromptVersion, 'v1'> {
  return version !== 'v1';
}

/**
 * CC-601 — prompts que sabem pedir a linha de "por quê": a v3 e a v4, que
 * têm o mesmo formato de saída e o mesmo exemplo.
 */
export const WHY_LINE_PROMPT_VERSIONS = [
  'v3',
  'v4',
] as const satisfies readonly DecisionPromptVersion[];
export type WhyLinePromptVersion = (typeof WHY_LINE_PROMPT_VERSIONS)[number];

export function supportsWhyLine(version: DecisionPromptVersion): version is WhyLinePromptVersion {
  return (WHY_LINE_PROMPT_VERSIONS as readonly DecisionPromptVersion[]).includes(version);
}

/**
 * `COPILOT_WHY_LINE` (CC-601): `on` pede a linha de "por quê" de cada conduta
 * "agora"; desligada por padrão — e aí o prompt e a saída são os de sempre,
 * byte a byte. Typo cai em desligada.
 */
export function readWhyLineFlag(config: ConfigService): boolean {
  return readBooleanFlag(config, 'COPILOT_WHY_LINE', false);
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
      `COPILOT_KNOWLEDGE_SOURCE=${requestedSource} exige COPILOT_REASONING=stages e COPILOT_DECISION_PROMPT=v2, v3 ou v4: ${RESEARCH_SOURCE_FALLBACK[requestedSource]}`,
    );
  }

  // CC-601 — a linha de "por quê" fala o formato da v3 e da v4; com outro
  // prompt efetivo (inclusive a v1 do rebaixamento acima), fica de fora.
  const requestedWhyLine = readWhyLineFlag(config);
  const whyLine = requestedWhyLine && supportsWhyLine(decisionPrompt);
  if (requestedWhyLine && !whyLine) {
    downgrades.push(
      `COPILOT_WHY_LINE exige COPILOT_DECISION_PROMPT=v3 ou v4 (efetivo: ${decisionPrompt}): plano sem a linha de por quê`,
    );
  }

  return {
    pipeline: {
      reasoning,
      decisionPrompt,
      knowledgeSource: researchUnavailable ? 'model_only' : requestedSource,
      whyLine,
    },
    downgrades,
  };
}

/** Caso grave (instável ou tempo-crítico) ou caso comum. */
export type DecisionRoute = 'critical' | 'standard';

export interface DecisionModelChoice {
  route: DecisionRoute;
  /** Referência do modelo (`perfil:modelo` ou `modelo`); `undefined` = `AI_MODEL`. */
  model: string | undefined;
}

function readOptionalModel(config: ConfigService, key: string): string | undefined {
  const configured = config.get<string | undefined>(key)?.trim();
  return configured ? configured : undefined;
}

/** `AI_DECISION_MODEL` e `AI_DECISION_CRITICAL_MODEL`; vazio = `undefined`. */
export function readDecisionModels(config: ConfigService): {
  standard: string | undefined;
  critical: string | undefined;
} {
  return {
    standard: readOptionalModel(config, 'AI_DECISION_MODEL'),
    critical: readOptionalModel(config, 'AI_DECISION_CRITICAL_MODEL'),
  };
}

/**
 * Plano de 13/10/2026, fase 0 — a decisão do caso grave pode ir para um
 * modelo mais forte que a do caso comum. `AI_DECISION_MODEL` vazio = o
 * `AI_MODEL`; `AI_DECISION_CRITICAL_MODEL` vazio = o mesmo modelo nas duas
 * rotas, como antes. Grave é instável ou tempo-crítico pela Etapa 1. Sem
 * entendimento (`legacy`, ou a Etapa 1 falhou), o caso conta como grave: na
 * dúvida, o modelo forte.
 */
export function chooseDecisionModel(
  config: ConfigService,
  understanding: CaseUnderstanding | null,
): DecisionModelChoice {
  const models = readDecisionModels(config);
  const critical =
    !understanding || understanding.instability.present || understanding.timeCritical;
  return critical
    ? { route: 'critical', model: models.critical ?? models.standard }
    : { route: 'standard', model: models.standard };
}
