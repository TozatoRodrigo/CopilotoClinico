import type { EncounterContext } from '../../../shared/contracts/clinical';
import {
  FACILITY_TYPE_LABELS,
  SITE_SPECIALIST_LABELS,
  type EncounterSite,
} from '../../../shared/contracts/practice-site';

/**
 * CC-602/CC-603 — o local de plantão no prompt da decisão, com
 * `COPILOT_SITE_CONTEXT=on`.
 *
 * Hoje o prompt só lista o recurso que o serviço TEM ("Tomografia
 * disponível"); a falta é silêncio, e o modelo planeja como se estivesse num
 * hospital de referência (TC de crânio "agora" numa UPA sem tomógrafo). Com o
 * local declarado, o bloco diz também o que NÃO tem, o porte, os especialistas
 * e o tempo até a referência, e a regra pede destino, prioridade e conduta até
 * a transferência.
 *
 * Só vale quando o caso tem local declarado (`context.site`): sem ele, um
 * recurso `false` quer dizer "não marcado", e tratá-lo como ausente mandaria
 * transferir o paciente de um hospital completo. Sem local, ou com a flag
 * desligada, o prompt fica byte a byte igual ao de antes.
 *
 * O bloco só usa listas fechadas e números do contrato: o nome do local
 * (texto livre) nunca entra.
 */

/** Os recursos do contexto que o bloco declara, com o nome que o médico lê. */
const RESOURCES: ReadonlyArray<
  readonly [keyof Pick<EncounterContext, 'hasCT' | 'hasLab' | 'hasICU'>, string]
> = [
  ['hasCT', 'tomografia'],
  ['hasLab', 'laboratório'],
  ['hasICU', 'UTI'],
];

export type DeclaredSiteContext = EncounterContext & { site: EncounterSite };

/** O caso tem local declarado e a flag está ligada. */
export function declaredSiteContext(
  context: EncounterContext,
  enabled: boolean | undefined,
): DeclaredSiteContext | null {
  if (!enabled || !context.site) return null;
  return { ...context, site: context.site };
}

/** Recursos que o local declarado não tem — vai para o log, sem dado de paciente. */
export function missingResources(context: EncounterContext): string[] {
  return RESOURCES.filter(([key]) => !context[key]).map(([key]) => key);
}

function referenceLine(site: EncounterSite): string {
  const { referenceTravelMinutes: minutes, referenceDistanceKm: km } = site;
  if (minutes === null && km === null) return 'Tempo até o hospital de referência: não informado.';
  if (minutes !== null && km !== null) {
    return `Tempo até o hospital de referência: cerca de ${minutes} min (${km} km).`;
  }
  return minutes !== null
    ? `Tempo até o hospital de referência: cerca de ${minutes} min.`
    : `Distância até o hospital de referência: cerca de ${km} km.`;
}

export function buildFacilityContextBlock(context: DeclaredSiteContext): string {
  const { site } = context;
  const available = RESOURCES.filter(([key]) => context[key]).map(([, label]) => label);
  const missing = RESOURCES.filter(([key]) => !context[key]).map(([, label]) => label);
  const specialists = site.specialists.map((specialist) => SITE_SPECIALIST_LABELS[specialist]);

  const lines = [
    `Local do atendimento: ${FACILITY_TYPE_LABELS[site.facilityType]}.`,
    available.length > 0 ? `Tem no local: ${available.join(', ')}.` : '',
    missing.length > 0 ? `NÃO tem no local: ${missing.join(', ')}.` : '',
    specialists.length > 0
      ? `Especialistas no plantão: ${specialists.join(', ')}.`
      : 'Especialistas no plantão: nenhum além do médico do plantão.',
    referenceLine(site),
    context.isSus ? 'Atendimento pelo SUS.' : '',
  ].filter(Boolean);

  return `<facility_context type="PHYSICIAN_DECLARED">
${lines.join('\n')}
</facility_context>`;
}

/**
 * CC-603 — a regra da decisão em etapas (v2, v3 e v4), no fim do system
 * prompt: o prefixo de antes continua igual e cacheável.
 */
export const FACILITY_TRANSFER_RULE_STAGED = `

FACILITY AND TRANSFER RULE: the <facility_context> block is where the physician is working now, as the physician declared it: the type of facility, the resources it has and does NOT have, the specialists on call and the time to the reference hospital. Plan for THIS facility.
- Never recommend, as an action to do here, an exam, procedure or treatment that needs a resource this facility does NOT have (no CT: no head CT or CT angiography here, and no thrombolysis or other treatment that needs a CT first; no ICU: no ICU admission here). That need becomes a transfer.
- When the case needs a resource or specialist this facility lacks, one "now" recommendation is the transfer. Write in it: where (the kind of facility and the resource it must have, e.g. "hospital com TC e trombólise (centro de AVC)"); how (central de regulação; SAMU when the patient needs advanced support on the way); and the priority, as "Prioridade: imediata", "Prioridade: urgente" or "Prioridade: eletiva". The priority is immediate when a time-critical treatment depends on that resource: request the transfer now, alongside stabilization, without waiting for tests this facility can do.
- Then, as "now" recommendations, the conduct until the transfer: what to start here with what this facility has, what to monitor and how often, what NOT to do here, and what to send with the patient (e.g. the last-known-well time, the ECG, the doses given). Count the time to the reference: when the time-critical treatment would arrive late, say what can be done here meanwhile, only if this facility can do it safely.
- Stay within the output limits: join related care while waiting into one recommendation.`;

/**
 * CC-603 — a mesma regra para o prompt v1 (sem camadas): a transferência é
 * recomendação definitiva, e as regras de citação do v1 continuam valendo.
 */
export const FACILITY_TRANSFER_RULE_V1 = `

FACILITY AND TRANSFER RULE: the <facility_context> block in the user message is where the physician is working now, as the physician declared it: the type of facility, the resources it has and does NOT have, the specialists on call and the time to the reference hospital. Plan for THIS facility.
- Never recommend, as an action to do here, an exam, procedure or treatment that needs a resource this facility does NOT have (no CT: no head CT or CT angiography here, and no thrombolysis or other treatment that needs a CT first; no ICU: no ICU admission here). That need becomes a transfer.
- When the case needs a resource or specialist this facility lacks, one recommendation with "preliminary": false is the transfer, right after any "stabilization" recommendation. Write in it: where (the kind of facility and the resource it must have, e.g. "hospital com TC e trombólise (centro de AVC)"); how (central de regulação; SAMU when the patient needs advanced support on the way); and the priority, as "Prioridade: imediata", "Prioridade: urgente" or "Prioridade: eletiva". The priority is immediate when a time-critical treatment depends on that resource: request the transfer now, alongside stabilization, without waiting for tests this facility can do.
- Then, as recommendations, the conduct until the transfer: what to start here with what this facility has, what to monitor and how often, what NOT to do here, and what to send with the patient (e.g. the last-known-well time, the ECG, the doses given). Count the time to the reference: when the time-critical treatment would arrive late, say what can be done here meanwhile, only if this facility can do it safely.
- The transfer and the conduct until it follow the same citation rules as every other recommendation.`;
