import { RECOMMENDATION_WHY_MAX_LENGTH } from '../../../shared/contracts/clinical';
import type { BuiltPrompt } from './prompt-builder';
import { buildStagedDecisionPrompt, type DecisionV2PromptInput } from './decision-prompt-v2';
import { DECISION_V3_INSTRUCTIONS, DECISION_V3_OUTPUT_SCHEMA } from './decision-prompt-v3';
import { DECISION_V4_INSTRUCTIONS } from './decision-prompt-v4';
import type { WhyLinePromptVersion } from './decision.settings';

/**
 * CC-601 — a decisão v3 (ou v4) pedindo, em cada conduta "agora",
 * uma linha de "por quê" em linguagem simples (`COPILOT_WHY_LINE`). Público:
 * o médico de UPA sem residência, que precisa entender por que cada conduta
 * está no plano para aprender e confiar sem abrir outra fonte.
 *
 * Por que um campo novo, e não o `rationale` de sempre: o `rationale` é a
 * justificativa técnica e tem outros donos — nomeia o documento oficial e o
 * anexo do médico, recebe a divergência da verificação com fonte depois da
 * decisão, entra no SOAP e é o que o juiz do gabarito lê. Encurtá-lo mudaria
 * tudo isso e, com a divergência acrescentada depois, nem caberia em 120
 * caracteres.
 *
 * O prompt é o da v3 (ou v4) com três acréscimos: a regra da linha depois das
 * instruções aprovadas (que entram literais), o campo `why` no formato de
 * saída e o mesmo exemplo com as linhas. Sem a flag nada daqui entra: o
 * prompt e o JSON Schema são os da v3 e da v4, byte a byte. Mudar este texto
 * muda o que o gabarito clínico mede.
 */

const MAX = RECOMMENDATION_WHY_MAX_LENGTH;

export const WHY_LINE_RULE = `WHY LINE. Many physicians reading this plan are general practitioners without emergency residency. Every "now" recommendation also carries "why": one plain sentence of at most ${MAX} characters saying why this action comes now — the risk it addresses or the decision it unlocks. When a specialty term or abbreviation is needed, explain it in a few words (e.g. "escala NIHSS de gravidade"). No dose, no source names, no probability language. "rationale" stays as before. "why" is null in "depends": the condition already says why the action waits.`;

/** A linha do campo no formato de saída, logo depois do `dependsOn`, na ordem do JSON Schema. */
const DEPENDS_ON_FIELD = `      "dependsOn": "string or null - the specific data that decides it; required when layer is depends, null when layer is now",\n`;
export const WHY_FIELD = `      "why": "string or null - required when layer is now: one plain sentence, at most ${MAX} characters, on why to do it now; null when layer is depends",\n`;

/** O formato e os tetos da v3, com o campo `why`. */
export const DECISION_V3_WHY_OUTPUT_SCHEMA = DECISION_V3_OUTPUT_SCHEMA.replace(
  DEPENDS_ON_FIELD,
  `${DEPENDS_ON_FIELD}${WHY_FIELD}`,
);

/**
 * O exemplo da v3 (AVC antes da TC) com a linha em cada conduta "agora" e
 * `null` na que depende da TC. Tirando os campos `why`, é o exemplo da v3
 * byte a byte (decision-why-line.spec.ts confere).
 */
export const DECISION_V3_WHY_EXAMPLE = `EXAMPLE — acute focal deficit before CT:
Case: "Homem, 70 anos, hemiparesia direita e afasia de início súbito. PA 178x96. Ainda sem TC."
Understanding (abridged): syndrome "deficit-neurologico-focal"; cannotMiss: AVC isquêmico por oclusão de grande vaso, hemorragia intracerebral, hipoglicemia; missingDiscriminators: horário do último momento visto bem, resultado da TC de crânio sem contraste, glicemia capilar.
Evidence: [ID: web:1] excerpt from the AHA/ASA guideline: "alteplase 0,9 mg/kg (máximo 90 mg) até 4,5 h do último momento visto bem, depois de a TC excluir hemorragia".
Expected output:
{
  "reasoning": "Déficit focal súbito: AVC até prova em contrário. Hemorragia intracerebral e hipoglicemia precisam ser afastadas antes de qualquer antitrombótico; oclusão de grande vaso indica trombectomia. O horário do último momento visto bem e a TC decidem a reperfusão.",
  "redFlags": [
    { "finding": "Déficit neurológico focal súbito", "severity": "high", "action": "Acionar o protocolo de AVC e levar à TC imediatamente" }
  ],
  "recommendations": [
    { "action": "Sala de emergência com monitorização e acionamento do protocolo de AVC (ou regulação/SAMU se não houver TC)", "rationale": "A reperfusão depende de TC e de equipe em minutos; sem TC no serviço, transferir", "category": "stabilization", "layer": "now", "dependsOn": null, "why": "No AVC cada minuto conta: a reperfusão (desentupir o vaso) só funciona nas primeiras horas", "basis": "model_knowledge", "citationChunkId": null, "confidence": 0.9 },
    { "action": "Glicemia capilar agora", "rationale": "Hipoglicemia mimetiza AVC e se corrige à beira do leito", "category": "diagnostic", "layer": "now", "dependsOn": null, "why": "Hipoglicemia imita AVC e se corrige em minutos, à beira do leito", "basis": "model_knowledge", "citationChunkId": null, "confidence": 0.95 },
    { "action": "Definir o último momento visto bem e aplicar o NIHSS", "rationale": "Janela e gravidade decidem trombólise e trombectomia", "category": "diagnostic", "layer": "now", "dependsOn": null, "why": "A hora do início e a gravidade (escala NIHSS) dizem se ainda cabe a reperfusão", "basis": "model_knowledge", "citationChunkId": null, "confidence": 0.9 },
    { "action": "TC de crânio sem contraste imediata, com angio-TC de crânio e pescoço", "rationale": "Separa isquemia de hemorragia e mostra oclusão de grande vaso", "category": "diagnostic", "layer": "now", "dependsOn": null, "why": "Só a tomografia separa sangramento de entupimento, e o tratamento de um piora o outro", "basis": "model_knowledge", "citationChunkId": null, "confidence": 0.9 },
    { "action": "Trombólise com alteplase 0,9 mg/kg (máximo 90 mg)", "rationale": "AVC isquêmico dentro de 4,5 h, sem hemorragia na TC", "category": "therapeutic", "layer": "depends", "dependsOn": "TC de crânio sem contraste sem hemorragia, dentro de 4,5 h do último momento visto bem e sem contraindicação", "why": null, "basis": "source", "citationChunkId": "web:1", "confidence": 0.8 }
  ],
  "uncertainty": false,
  "uncertaintyReason": null,
  "differentials": [
    { "hypothesis": "Hemorragia intracerebral", "whyConsider": "Déficit súbito com PA elevada", "whatDistinguishes": "TC de crânio sem contraste", "cannotMiss": true, "timeToHarm": "minutos" },
    { "hypothesis": "Hipoglicemia", "whyConsider": "Mimetiza déficit focal", "whatDistinguishes": "Glicemia capilar", "cannotMiss": true, "timeToHarm": "minutos" }
  ],
  "clarifyingQuestions": [
    { "id": "q-ultimo-visto-bem", "question": "Qual o horário do último momento em que ele foi visto sem o déficit?", "why": "Define a janela de trombólise e de trombectomia", "separates": ["AVC dentro da janela de reperfusão", "AVC fora da janela"], "criticality": "blocker", "expectedAnswerType": "text", "choices": null, "purpose": "Janela de reperfusão" },
    { "id": "q-anticoagulante", "question": "Ele usa anticoagulante?", "why": "Anticoagulação contraindica trombólise e muda o manejo de uma hemorragia", "separates": ["Candidato à trombólise", "Contraindicação à trombólise"], "criticality": "important", "expectedAnswerType": "boolean", "choices": null, "purpose": "Contraindicações à trombólise" }
  ]
}`;

function withWhyLine(instructions: string): string {
  return `${instructions}

${WHY_LINE_RULE}

${DECISION_V3_WHY_OUTPUT_SCHEMA}

${DECISION_V3_WHY_EXAMPLE}`;
}

export const DECISION_V3_WHY_SYSTEM_PROMPT = withWhyLine(DECISION_V3_INSTRUCTIONS);
export const DECISION_V4_WHY_SYSTEM_PROMPT = withWhyLine(DECISION_V4_INSTRUCTIONS);

const WHY_LINE_SYSTEM_PROMPTS: Record<WhyLinePromptVersion, string> = {
  v3: DECISION_V3_WHY_SYSTEM_PROMPT,
  v4: DECISION_V4_WHY_SYSTEM_PROMPT,
};

/** Mensagem do usuário da v2, byte a byte; só o system prompt muda. */
export function buildDecisionWhyLinePrompt(
  version: WhyLinePromptVersion,
  input: DecisionV2PromptInput,
): BuiltPrompt {
  return buildStagedDecisionPrompt(WHY_LINE_SYSTEM_PROMPTS[version], input);
}
