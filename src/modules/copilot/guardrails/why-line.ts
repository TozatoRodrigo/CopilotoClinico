import { RECOMMENDATION_WHY_MAX_LENGTH } from '../../../shared/contracts/clinical';
import { indexesWhere, type CopilotOutputV2 } from './output-validator-v2';

/**
 * CC-601 — regras da linha de "por quê" (`COPILOT_WHY_LINE`): cada conduta
 * "agora" diz, em até 120 caracteres e linguagem simples, por que está no
 * plano.
 *
 * A linha nunca pede um retry sozinha: um retry custa cerca de 27 s de
 * plantão, e o gabarito só aceita a linha se a latência não subir mais de
 * 10%. Por isso:
 * - linha acima do teto sai da resposta, sem retry. Nunca é cortada com
 *   reticências: meia frase clínica engana mais que nenhuma, e sem a linha a
 *   UI mostra o `rationale`, como antes da flag;
 * - conduta "agora" sem linha fica como está, também com o `rationale`;
 * - os dois achados entram no feedback quando outra regra já vai pedir o
 *   retry (o modelo reescreve o JSON inteiro de qualquer jeito) e viram aviso
 *   quando não.
 */

export interface WhyLineCheck {
  /** A resposta sem as linhas acima do teto. */
  output: CopilotOutputV2;
  /** Achados para o feedback do retry ou para o aviso, pelos índices da resposta do modelo. */
  findings: string[];
}

export function checkWhyLines(output: CopilotOutputV2): WhyLineCheck {
  const max = RECOMMENDATION_WHY_MAX_LENGTH;
  const tooLong = indexesWhere(
    output.recommendations,
    (rec) => (rec.why?.trim().length ?? 0) > max,
  );
  const missing = indexesWhere(
    output.recommendations,
    (rec) => rec.layer === 'now' && !rec.why?.trim(),
  );

  const findings = [
    tooLong.length > 0
      ? `WHY LINE TOO LONG: recommendations at index ${tooLong.join(', ')} have a "why" longer ` +
        `than ${max} characters. Rewrite each as one plain sentence of at most ${max} characters; ` +
        'keep the detail in "rationale".'
      : null,
    missing.length > 0
      ? `WHY LINE MISSING: recommendations at index ${missing.join(', ')} have "layer": "now" but ` +
        `no "why". Add one plain sentence of at most ${max} characters saying why the action ` +
        'comes now.'
      : null,
  ].filter((finding): finding is string => finding !== null);

  if (tooLong.length === 0) return { output, findings };
  const removed = new Set(tooLong);
  return {
    output: {
      ...output,
      recommendations: output.recommendations.map((rec, index) =>
        removed.has(index) ? { ...rec, why: undefined } : rec,
      ),
    },
    findings,
  };
}
