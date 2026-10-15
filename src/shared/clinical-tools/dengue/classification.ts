import {
  CLASSIFICATION_REASON,
  DENGUE_GROUP_INFO,
  type AlarmSignId,
  type DengueGroup,
  type GravitySignId,
  type RiskConditionId,
} from './content';

/** Sinais marcados na trilha: gravidade, alarme e condições de risco. */
export interface DengueSigns {
  gravity: readonly GravitySignId[];
  alarms: readonly AlarmSignId[];
  risks: readonly RiskConditionId[];
}

export interface DengueClassification {
  group: DengueGroup;
  /** Nome curto do grupo ("Internação"). */
  label: string;
  /** Por que esse grupo e a sugestão ("Sinais de alarme presentes — considere …"). */
  reason: string;
}

/**
 * Classificação de risco do Ministério da Saúde, na ordem do `classifyNow` do
 * ANY: qualquer sinal de gravidade → D; senão qualquer sinal de alarme → C;
 * senão qualquer condição de risco → B; senão A. O teste diferencial confere
 * as 65.536 combinações de marcação contra o ANY.
 */
export function classifyDengue(signs: DengueSigns): DengueClassification {
  const group: DengueGroup =
    signs.gravity.length > 0
      ? 'D'
      : signs.alarms.length > 0
        ? 'C'
        : signs.risks.length > 0
          ? 'B'
          : 'A';
  return { group, label: DENGUE_GROUP_INFO[group].label, reason: CLASSIFICATION_REASON[group] };
}
