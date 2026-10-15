/**
 * Os sete cenários do PedGuide v4 (CC-320): cada um abre só o que o cenário
 * pede — as drogas em bolus e as infusões, com o checklist de intubação ou os
 * fluidos quando o ANY mostra. As doses vêm do peso em uso; o cenário só
 * escolhe o que aparece.
 */

export interface PediatricScenario {
  /** Id de URL (/ferramentas/pediatria/cenarios/[id]). */
  id: string;
  /** Chave do cenário no ANY (`SCENARIO_CONFIGS`), para o teste diferencial. */
  anyKey: string;
  title: string;
  description: string;
  /** Sinônimos para a busca. */
  aliases: readonly string[];
  /** Ids das drogas em bolus, na ordem do ANY. */
  drugs: readonly string[];
  /** Ids das infusões, na ordem do ANY. */
  infusions: readonly string[];
  checklist?: boolean;
  fluids?: boolean;
}

export const PEDIATRIC_SCENARIOS: readonly PediatricScenario[] = [
  {
    id: 'anafilaxia',
    anyKey: 'anafilaxia',
    title: 'Anafilaxia',
    description: 'Epinefrina IM, corticoide, anti-histamínico',
    aliases: ['alergia', 'choque anafilático', 'adrenalina im'],
    drugs: ['epinefrina-im', 'hidrocortisona', 'difenidramina'],
    infusions: [],
  },
  {
    id: 'status-epilepticus',
    anyKey: 'convulsão',
    title: 'Status Epilepticus',
    description: 'Diazepam, midazolam, fenitoína, fenobarbital',
    aliases: ['estado de mal epiléptico', 'convulsão', 'crise convulsiva'],
    drugs: ['diazepam', 'midazolam-conv', 'fenitoina', 'fenobarbital', 'levetiracetam'],
    infusions: [],
  },
  {
    id: 'iot-isr',
    anyKey: 'isr',
    title: 'IOT / ISR',
    description: 'Checklist, cetamina, rocurônio, succinilcolina',
    aliases: ['intubação', 'sequência rápida', 'via aérea'],
    drugs: ['cetamina', 'midazolam', 'fentanil', 'rocuronio'],
    infusions: [],
    checklist: true,
  },
  {
    id: 'choque',
    anyKey: 'choque',
    title: 'Choque',
    description: 'Fluidos, epinefrina, norepinefrina, dobutamina',
    aliases: ['choque séptico', 'hipotensão', 'drogas vasoativas'],
    drugs: [],
    infusions: ['epinefrina_inf', 'norepinefrina', 'dobutamina'],
    fluids: true,
  },
  {
    id: 'choque-cardiogenico',
    anyKey: 'choque-cardio',
    title: 'Choque cardiogênico',
    description: 'Dobutamina, milrinona, epinefrina',
    aliases: ['inotrópico', 'disfunção miocárdica'],
    drugs: [],
    infusions: ['dobutamina', 'milrinona', 'epinefrina_inf'],
  },
  {
    id: 'pos-pcr',
    anyKey: 'pos-pcr',
    title: 'Pós-PCR / Arritmia',
    description: 'Amiodarona, epinefrina, norepinefrina',
    aliases: ['pós-parada', 'rce', 'arritmia'],
    drugs: [],
    infusions: ['amiodarona_inf', 'epinefrina_inf', 'norepinefrina'],
  },
  {
    id: 'sedacao-pos-iot',
    anyKey: 'sedação',
    title: 'Sedação pós-IOT',
    description: 'Fentanil, midazolam, dexmedetomidina, cetamina',
    aliases: ['sedação contínua', 'analgesia contínua'],
    drugs: [],
    infusions: ['fentanil_inf', 'midazolam_inf', 'dexmedetomidina', 'cetamina_inf'],
  },
];

export function getPediatricScenario(id: string): PediatricScenario | undefined {
  return PEDIATRIC_SCENARIOS.find((scenario) => scenario.id === id);
}
