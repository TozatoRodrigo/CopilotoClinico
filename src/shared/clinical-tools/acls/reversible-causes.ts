/**
 * Causas reversíveis (H's e T's) e checklist pós-RCE do `AclsGuide` do ANY
 * (CC-314), como dado. Texto igual ao do ANY, com acentuação corrigida
 * ("coronária"), imperativo trocado por infinitivo e a unidade da glicemia
 * explicitada; o que pareceu inconsistente está em
 * docs/ferramentas/revisao-clinica/acls.md.
 */

/** Ferramentas do Copiloto que um card pode abrir (no ANY: Airway Guide e Tox Path). */
export type ReversibleCauseLinkTarget = 'via-aerea' | 'toxicologia';

export interface ReversibleCause {
  id: string;
  name: string;
  /** Conduta; a primeira frase é o destaque do card. */
  action: string;
  link?: ReversibleCauseLinkTarget;
}

export const HS_CAUSES: readonly ReversibleCause[] = [
  {
    id: 'hipovolemia',
    name: 'Hipovolemia',
    action:
      'SF 0,9% 500 ml bolus rápido, repetir conforme necessidade. Hemoderivados se trauma ou hemorragia ativa.',
  },
  {
    id: 'hipoxia',
    name: 'Hipóxia',
    action: 'FiO₂ 100%. Considerar IOT. Verificar posição do tubo.',
    link: 'via-aerea',
  },
  {
    id: 'acidose',
    name: 'Hidrogênio (acidose)',
    action:
      'Bicarbonato de sódio 1 mEq/kg IV. Considerar se PCR prolongada, acidose prévia ou hipercalemia.',
  },
  {
    id: 'potassio',
    name: 'Hipo/Hipercalemia',
    action:
      'Hipercalemia: Gluconato de cálcio 10% 20 ml IV (2-5 min), Insulina regular 10 UI + Glicose 50% 25 g IV, Bicarbonato 50 mEq IV. Hipocalemia: KCl 20 mEq IV em 1h, Sulfato de magnésio 2 g IV.',
  },
  {
    id: 'hipotermia',
    name: 'Hipotermia',
    action:
      'Reaquecimento ativo: SF aquecido 42 °C IV, manta térmica, lavagem peritoneal/pleural se grave (menor que 30 °C). Manter RCP — não declarar óbito até reaquecer.',
  },
];

export const TS_CAUSES: readonly ReversibleCause[] = [
  {
    id: 'pneumotorax',
    name: 'Tensão (pneumotórax hipertensivo)',
    action:
      'Descompressão com agulha no 2° EIC linha hemiclavicular ou 5° EIC linha axilar anterior. Seguida de drenagem torácica.',
  },
  {
    id: 'tamponamento',
    name: 'Tamponamento cardíaco',
    action:
      'Pericardiocentese guiada por USG (subxifoide). Volume rápido IV para manter pré-carga. Considerar toracotomia de emergência se trauma.',
  },
  {
    id: 'toxinas',
    name: 'Toxinas',
    action:
      'Identificar agente e administrar antídoto específico. Considerar carvão ativado se ingestão recente.',
    link: 'toxicologia',
  },
  {
    id: 'tep',
    name: 'Trombose pulmonar (TEP)',
    action:
      'Trombólise: Alteplase 50 mg IV em bolus durante a RCP. Se suspeita forte, considerar trombólise empírica. Manter RCP por pelo menos 60-90 min após trombólise.',
  },
  {
    id: 'iam',
    name: 'Trombose coronária (IAM)',
    action:
      'Cateterismo de emergência (ICP) se disponível. Se não: trombólise com tenecteplase ou alteplase. ECG 12 derivações pós-ROSC.',
  },
];

/**
 * Destaque do card como no ANY: o texto até o primeiro ponto. Os textos usam
 * vírgula decimal, então o ponto só aparece no fim de frase.
 */
export function splitFirstSentence(action: string): { lead: string; rest: string } {
  const end = action.indexOf('.');
  if (end < 0) return { lead: action, rest: '' };
  return { lead: action.slice(0, end + 1), rest: action.slice(end + 1).trim() };
}

export const ROSC_CHECKLIST_IDS = [
  'via-aerea',
  'oxigenio',
  'paco2',
  'pam',
  'ecg',
  'imagem',
  'temperatura',
  'cateterismo',
  'convulsao',
  'glicemia',
] as const;
export type RoscChecklistItemId = (typeof ROSC_CHECKLIST_IDS)[number];

/** Checklist pós-RCE do ANY (AHA 2025), na mesma ordem. */
export const ROSC_CHECKLIST: readonly { id: RoscChecklistItemId; text: string }[] = [
  { id: 'via-aerea', text: 'Via aérea: avaliar/confirmar posicionamento' },
  { id: 'oxigenio', text: 'FiO₂ 100% até SpO₂ confiável, depois alvo 90-98%' },
  { id: 'paco2', text: 'PaCO2 alvo 35-45 mmHg' },
  { id: 'pam', text: 'PAM alvo maior ou igual a 65 mmHg' },
  { id: 'ecg', text: 'ECG 12 derivações' },
  { id: 'imagem', text: 'Considere TC e/ou eco a beira-leito' },
  {
    id: 'temperatura',
    text: 'Segue comandos? Se não: controle de temperatura (32-37,5 °C por pelo menos 36h)',
  },
  {
    id: 'cateterismo',
    text: 'Considere cate se: ST supra persistente, choque cardiogênico, arritmia refratária',
  },
  { id: 'convulsao', text: 'Avaliar convulsão, solicitar EEG se não segue comandos' },
  {
    id: 'glicemia',
    text: 'Evitar hipoglicemia (menor que 70 mg/dL) e hiperglicemia (maior que 180 mg/dL)',
  },
];
