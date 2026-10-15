import type { ContentProvenance } from '../provenance';
import type { ResultTone } from '../tone';

/**
 * Conteúdo clínico do roteiro de dengue (CC-325), extraído do DenguePath do
 * ANY App v4 como dado (ADR-017): sinais, grupos, condutas, volumes, E-FASD,
 * exames, alta segura e referências. A tela só desenha; nenhuma dose, limiar
 * ou critério mora em componente.
 *
 * Mudanças em relação ao ANY, todas listadas em
 * docs/ferramentas/revisao-clinica/dengue.md para a revisão clínica (CC-310):
 * acentuação corrigida ("petéquias", "3º", "6ª"), "imediatamente" trocado por
 * sugestão nas condutas do médico e caixa-alta virando caixa normal (o design
 * system proíbe rótulo em caixa-alta). Doses, volumes, limiares e critérios
 * estão como no ANY — o teste de paridade de texto confere.
 */

export const DENGUE_PROVENANCE: ContentProvenance = {
  source: 'ANY App v4 · DenguePath.tsx e calculations.ts (95c8fba)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

// ---------------------------------------------------------------------------
// Sinais e grupos
// ---------------------------------------------------------------------------

export interface SignItem<Id extends string = string> {
  id: Id;
  label: string;
}

/** Os 8 sinais de alarme do ANY (`ALARM_LABELS`), na mesma ordem. */
export const ALARM_SIGNS = [
  { id: 'dor-abdominal', label: 'Dor abdominal intensa e contínua' },
  { id: 'vomitos', label: 'Vômitos persistentes' },
  {
    id: 'acumulo-liquidos',
    label: 'Acúmulo de líquidos (ascite, derrame pleural ou pericárdico)',
  },
  { id: 'hipotensao-postural', label: 'Hipotensão postural e/ou lipotimia' },
  { id: 'hepatomegalia', label: 'Hepatomegalia >2 cm abaixo do rebordo costal' },
  { id: 'sangramento-mucosas', label: 'Sangramento de mucosas' },
  { id: 'letargia', label: 'Letargia e/ou irritabilidade' },
  { id: 'hematocrito', label: 'Hematócrito em ascensão (aumento ≥20% do valor basal)' },
] as const satisfies readonly SignItem[];

/** Os 3 sinais de gravidade do ANY (`GRAVITY_LABELS`). */
export const GRAVITY_SIGNS = [
  { id: 'choque', label: 'Choque (hipotensão, TEC >2s, pulsos finos, extremidades frias)' },
  {
    id: 'hemorragia-grave',
    label: 'Hemorragia grave (hematêmese, melena, metrorragia volumosa, SNC)',
  },
  {
    id: 'disfuncao-organica',
    label: 'Disfunção orgânica grave (miocardite, encefalite, hepatite grave, IRA)',
  },
] as const satisfies readonly SignItem[];

/** As 5 condições de risco da trilha do ANY (`RISK_LABELS`). */
export const RISK_CONDITIONS = [
  { id: 'gestante', label: 'Gestante' },
  { id: 'idade-65', label: 'Idade superior a 65 anos' },
  {
    id: 'comorbidades',
    label: 'Comorbidades (HAS, DM, doença renal, DPOC, hepatopatia, doença hematológica)',
  },
  { id: 'risco-social', label: 'Risco social (difícil acesso ao serviço de saúde)' },
  { id: 'plaquetopenia', label: 'Plaquetopenia <100.000/mm³' },
] as const satisfies readonly SignItem[];

export type AlarmSignId = (typeof ALARM_SIGNS)[number]['id'];
export type GravitySignId = (typeof GRAVITY_SIGNS)[number]['id'];
export type RiskConditionId = (typeof RISK_CONDITIONS)[number]['id'];

export const ALARM_SIGN_IDS: readonly AlarmSignId[] = ALARM_SIGNS.map(({ id }) => id);
export const GRAVITY_SIGN_IDS: readonly GravitySignId[] = GRAVITY_SIGNS.map(({ id }) => id);
export const RISK_CONDITION_IDS: readonly RiskConditionId[] = RISK_CONDITIONS.map(({ id }) => id);

export const DENGUE_GROUPS = ['A', 'B', 'C', 'D'] as const;
export type DengueGroup = (typeof DENGUE_GROUPS)[number];

export interface GroupInfo {
  /** Nome curto do grupo no ANY (`GRUPO_CONFIG.label`). */
  label: string;
  /**
   * Tom (ADR-017, "Cores"): o verde do A vira neutro, o amarelo do B vira
   * atenção, e o vermelho do C (#FF5252) e do D (#F44336), crítico.
   */
  tone: ResultTone;
  /** Descrição no atalho "Manejo por grupos". */
  hubDescription: string;
}

export const DENGUE_GROUP_INFO: Record<DengueGroup, GroupInfo> = {
  A: { label: 'Ambulatorial', tone: 'neutral', hubDescription: 'Ambulatorial' },
  B: { label: 'Observação', tone: 'attention', hubDescription: 'Observação ≥6h' },
  C: { label: 'Internação', tone: 'critical', hubDescription: 'Internação + IV' },
  D: { label: 'UTI / Emergência', tone: 'critical', hubDescription: 'UTI / Emergência' },
};

/** Motivo de cada grupo na classificação da trilha (`classifyNow` do ANY). */
export const CLASSIFICATION_REASON: Record<DengueGroup, string> = {
  D: 'Sinais de gravidade presentes — considere UTI ou sala de emergência',
  C: 'Sinais de alarme presentes — considere internação para hidratação IV e monitorização',
  B: 'Condição de risco presente — considere observação em unidade de saúde com reavaliação',
  A: 'Sem sinais de alarme ou risco — considere acompanhamento ambulatorial com hidratação oral',
};

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------

/**
 * As 17 telas do DenguePath, na ordem do ANY (`Screen`): início, os 5 passos
 * da trilha (o 4º é o manejo do grupo classificado), o atalho por grupos, a
 * classificação direta, o manejo de cada grupo, calculadoras, E-FASD, exames,
 * alta segura e referências.
 */
export const DENGUE_SCREENS = [
  'inicio',
  'trilha-1',
  'trilha-2',
  'trilha-3',
  'trilha-4',
  'trilha-5',
  'grupos',
  'classificacao',
  'grupo-a',
  'grupo-b',
  'grupo-c',
  'grupo-d',
  'calculadoras',
  'efasd',
  'exames',
  'alta',
  'referencias',
] as const;
export type DengueScreen = (typeof DENGUE_SCREENS)[number];

export type GroupScreen = 'grupo-a' | 'grupo-b' | 'grupo-c' | 'grupo-d';

export const GROUP_SCREEN: Record<DengueGroup, GroupScreen> = {
  A: 'grupo-a',
  B: 'grupo-b',
  C: 'grupo-c',
  D: 'grupo-d',
};

/** Telas em que o ANY mostra o campo de peso (`SCREENS_WITH_WEIGHT`). */
export const WEIGHT_SCREENS: readonly DengueScreen[] = [
  'trilha-2',
  'trilha-3',
  'trilha-4',
  'trilha-5',
  'grupos',
  'classificacao',
  'grupo-a',
  'grupo-b',
  'grupo-c',
  'grupo-d',
  'calculadoras',
];

/** Atalhos do menu do ANY (`fabItems`), na mesma ordem. */
export const DENGUE_NAV: readonly { label: string; screen: DengueScreen }[] = [
  { label: 'Início', screen: 'inicio' },
  { label: 'Trilha', screen: 'trilha-1' },
  { label: 'Grupos', screen: 'grupos' },
  { label: 'Calculadoras', screen: 'calculadoras' },
  { label: 'Exames', screen: 'exames' },
  { label: 'Alta segura', screen: 'alta' },
];

// ---------------------------------------------------------------------------
// Blocos de conteúdo
// ---------------------------------------------------------------------------

/** Volumes de `calcDengueHydration` do ANY, com nomes em inglês do código. */
export const HYDRATION_KEYS = [
  'oralTotal',
  'oralSro',
  'oralLiquids',
  'ivHourly',
  'iv2h',
  'maintenance6h',
  'maintenance8h',
  'bolus',
  'albuminLow',
  'albuminHigh',
] as const;
export type HydrationKey = (typeof HYDRATION_KEYS)[number];

/**
 * Texto com volume do peso. `{oralSro}` vira o volume formatado ("1.400") e
 * `{maintenance6h/6}`, o volume dividido por 6 (a vazão em mL/h). Sem peso
 * válido, cada marcador vira "--", como no ANY.
 */
export type VolumeText = string;

/** Linha de apoio abaixo do número de um volume. */
export type FigureDetail =
  | { kind: 'text'; text: VolumeText }
  /** "292 mL/h": o volume dividido pelas horas. Sem peso, "--". */
  | { kind: 'rate'; volume: HydrationKey; hours: number }
  /** "4 frascos" de albumina 20% de 50 mL. Sem peso, "--". */
  | { kind: 'vials'; volume: HydrationKey };

export interface VolumeFigure {
  /** Rótulo pequeno acima do número ("25 mL/kg em 6h"). */
  caption?: string;
  volume: HydrationKey;
  unit: string;
  detail?: FigureDetail;
}

export type TableCell = string | { group: DengueGroup };

export interface ProcedureStep {
  title: string;
  text: string;
}

/**
 * Um bloco de conteúdo. `notice` é o AlertCard do ANY (tom: info e success
 * viram neutro, warning vira atenção, danger vira crítico); `note` é o
 * InfoCard (bloco de referência, sem tom). `**texto**` marca ênfase.
 */
export type DengueBlock =
  | {
      kind: 'notice';
      tone: ResultTone;
      title?: string;
      text?: VolumeText;
      items?: readonly string[];
    }
  | { kind: 'note'; title: string; text?: VolumeText; items?: readonly string[] }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  | { kind: 'list'; items: readonly string[]; tone?: 'critical' }
  | { kind: 'volumes'; label: string; figures: readonly VolumeFigure[]; note?: string }
  | { kind: 'table'; head: readonly string[]; rows: readonly (readonly TableCell[])[] }
  | { kind: 'steps'; start?: number; items: readonly ProcedureStep[] }
  /** Botão de reclassificação: leva ao manejo do grupo `to`. */
  | { kind: 'reclassify'; to: DengueGroup; label: string }
  /** Botão que abre outra tela do roteiro ("Orientações de alta completas →"). */
  | { kind: 'link'; to: DengueScreen; label: string }
  /** Calculadora de variação do hematócrito (campos e resultado). */
  | { kind: 'hematocrit' };

export interface SectionBadge {
  label: string;
  tone: ResultTone;
}

/** Seção recolhível (Collapsible do ANY), fechada por padrão como lá. */
export interface DengueSection {
  title: string;
  badge?: SectionBadge;
  blocks: readonly DengueBlock[];
}

export interface DengueScreenContent {
  title: string;
  subtitle?: string;
  /** Blocos acima das seções. */
  intro?: readonly DengueBlock[];
  sections: readonly DengueSection[];
  /** Blocos abaixo das seções (botões, reclassificação). */
  outro?: readonly DengueBlock[];
}

// ---------------------------------------------------------------------------
// Textos repetidos
// ---------------------------------------------------------------------------

const ORAL_HYDRATION_SPLIT: FigureDetail = {
  kind: 'text',
  text: '1/3 SRO ({oralSro} mL) + 2/3 líquidos ({oralLiquids} mL)',
};

const RETURN_SIGNS_SUMMARY =
  'Dor abdominal intensa, vômitos persistentes, sangramento, tontura ao levantar, pele fria/pálida, dispneia, sonolência ou agitação.';

const RECLASSIFY_TO_C_TEXT =
  'Surgimento de qualquer sinal de alarme ou hematócrito em ascensão (aumento ≥20% do valor basal). Referência: homem ~45%, mulher ~40%. Repetir Ht a cada 2-4h durante expansão.';

const RESUSCITATION_TARGETS = [
  'PAS >90 mmHg (ou PAM >65 mmHg)',
  'FC <100 bpm',
  'TEC <2s',
  'Diurese >0,5 mL/kg/h',
  'Ht estável ou em queda',
  'Melhora do nível de consciência',
] as const;

const ICU_CRITERIA = [
  'Choque refratário a 2 expansões',
  'Necessidade de vasopressor',
  'Sangramento grave ativo',
  'Disfunção orgânica (IRA, SDRA, encefalite)',
  'Rebaixamento do nível de consciência',
] as const;

const CRITICAL_PHASE: readonly DengueBlock[] = [
  {
    kind: 'notice',
    tone: 'critical',
    title: 'Período de maior risco',
    text: 'Ocorre entre o 3º e 7º dia de doença. Janela de 24-48h de maior risco de extravasamento plasmático.',
  },
  {
    kind: 'note',
    title: 'Conduta',
    text: 'Considere intensificar monitorização quando a febre ceder. A melhora da febre não significa melhora clínica — pode indicar o início da fase crítica.',
  },
];

/** Sinais de retorno imediato que o médico passa ao paciente (Grupo A e alta). */
export const RETURN_SIGNS = [
  'Dor abdominal intensa e contínua',
  'Vômitos persistentes',
  'Sangramento (gengiva, nariz, fezes escuras, urina escura)',
  'Tontura ou desmaio ao levantar',
  'Pele fria, pálida ou pegajosa',
  'Dificuldade para respirar',
  'Sonolência excessiva ou agitação',
] as const;

const DISCHARGE_TO_SCREEN: DengueBlock = {
  kind: 'link',
  to: 'alta',
  label: 'Orientações de alta completas →',
};

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

export const DENGUE_HOME = {
  adultWarning: 'Ferramenta para adultos (≥15 anos)',
  trail: {
    title: 'Trilha da dengue',
    description: 'Trilha completa: avaliação → classificação → manejo → desfecho',
  },
  entries: [
    { screen: 'grupos', label: 'Manejo por grupos', description: 'Grupos A, B, C e D' },
    { screen: 'calculadoras', label: 'Calculadoras', description: 'VO, IV, albumina' },
    { screen: 'efasd', label: 'Protocolo E-FASD', description: 'POCUS na dengue' },
    {
      screen: 'exames',
      label: 'Exames e diag. diferenciais',
      description: 'Laboratório e arboviroses',
    },
    {
      screen: 'classificacao',
      label: 'Classificação direta',
      description: 'Gravidade → alarme → risco',
    },
    { screen: 'alta', label: 'Alta segura', description: 'Critérios e orientações' },
    { screen: 'referencias', label: 'Referências', description: 'Fontes e bibliografia' },
  ],
} as const satisfies {
  adultWarning: string;
  trail: { title: string; description: string };
  entries: readonly { screen: DengueScreen; label: string; description: string }[];
};

// ---------------------------------------------------------------------------
// Trilha (passos 1 a 5)
// ---------------------------------------------------------------------------

export const TRAIL_STEP_COUNT = 5;

export const TRAIL_STEP_TITLES: Record<1 | 2 | 3 | 5, string> = {
  1: 'Avaliação inicial e suspeita',
  2: 'Sinais de alarme',
  3: 'Classificação',
  5: 'Critérios de alta e seguimento',
};

export const TRAIL_STEP_1: readonly DengueBlock[] = [
  {
    kind: 'notice',
    tone: 'neutral',
    title: 'Caso suspeito',
    text: 'Febre (geralmente 2-7 dias) + epidemiologia compatível + ≥2 dos seguintes: cefaleia, dor retroorbitária, mialgia, artralgia, prostração, exantema.',
  },
  {
    kind: 'paragraph',
    muted: true,
    text: 'Marque apenas o que se aplica ao paciente. Se nenhum item se aplica, avance normalmente.',
  },
  {
    kind: 'note',
    title: 'Prova do laço',
    text: 'Insuflar manguito no ponto médio entre PAS e PAD por 5 min. Contar petéquias em quadrado 2,5 x 2,5 cm. Positiva: ≥20 petéquias (adultos). Resultado falso-negativo pode ocorrer em pacientes obesos, em choque ou em uso de anti-hipertensivos.',
  },
  {
    kind: 'notice',
    tone: 'attention',
    title: 'Exames iniciais sugeridos',
    text: 'Hemograma com hematócrito. Se sinais de alarme ou gravidade: função renal, hepática, coagulograma, tipagem.',
  },
];

/** "1 sinal de alarme", "3 sinais de alarme". */
export function alarmCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'sinal de alarme' : 'sinais de alarme'}`;
}

export const TRAIL_STEP_2 = {
  hint: 'Marque os sinais presentes. Se nenhum, avance para a classificação.',
  rule: '**Qualquer um** presente → pelo menos Grupo C.',
  alarmNotice: 'Classificar como pelo menos Grupo C.',
} as const;

export const TRAIL_STEP_3 = {
  hint: 'Marque apenas o que se aplica. Se nenhum item se aplica em cada seção, prossiga para classificar.',
  gravityTitle: 'Sinais de gravidade',
  alarmTitle: 'Sinais de alarme',
  riskTitle: 'Condições de risco',
  noAlarms: 'Nenhum sinal de alarme identificado no passo anterior',
  alarmsFound: {
    singular: 'sinal de alarme identificado',
    plural: 'sinais de alarme identificados',
  },
  resultTitle: 'Classificação sugerida',
  openGroup: 'Ver manejo do Grupo',
  reassess: 'Reavaliar classificação',
} as const;

/** Manejo condensado de cada grupo no passo 4 da trilha (`renderStepGrupo`). */
export const TRAIL_GROUP_STEP: Record<DengueGroup, readonly DengueBlock[]> = {
  A: [
    {
      kind: 'notice',
      tone: 'neutral',
      title: 'Conduta',
      text: 'Hidratação oral domiciliar + acompanhamento ambulatorial.',
    },
    {
      kind: 'volumes',
      label: 'Hidratação oral: 60 mL/kg/dia',
      figures: [{ volume: 'oralTotal', unit: 'mL/dia', detail: ORAL_HYDRATION_SPLIT }],
    },
    {
      kind: 'note',
      title: 'Orientação prática',
      text: 'Considere oferecer água, suco de frutas, chá, água de coco. Evitar bebidas com cafeína. Distribuir ao longo do dia (não forçar grandes volumes de uma vez).',
    },
    {
      kind: 'note',
      title: 'Antieméticos (se necessário)',
      text: 'Metoclopramida 10 mg IV/VO 8/8h (ampola 10 mg/2 mL) ou ondansetrona 4-8 mg IV/VO 8/8h (ampola 4 mg/2 mL). Evitar AINEs e AAS.',
    },
    {
      kind: 'notice',
      tone: 'attention',
      title: 'Orientar retorno imediato se:',
      text: RETURN_SIGNS_SUMMARY,
    },
  ],
  B: [
    {
      kind: 'notice',
      tone: 'attention',
      title: 'Conduta',
      text: 'Hidratação oral supervisionada em unidade de saúde por pelo menos 6 horas. Solicitar hemograma com hematócrito.',
    },
    {
      kind: 'volumes',
      label: 'Hidratação oral: 60 mL/kg/dia',
      figures: [{ volume: 'oralTotal', unit: 'mL/dia', detail: ORAL_HYDRATION_SPLIT }],
    },
    {
      kind: 'note',
      title: 'Condições de risco',
      text: 'Gestante, <2 anos ou >65 anos, HAS, DM, DPOC, doença hematológica, renal crônica, doença péptica, hepatopatia, doença autoimune, uso de anticoagulantes, risco social.',
    },
    {
      kind: 'note',
      title: 'Acompanhamento',
      text: 'Hemograma com hematócrito antes da hidratação e após (em 4-6h). Se Ht estável e sem sinais de alarme, considere alta com orientações. Se Ht subindo, considere reclassificar para Grupo C.',
    },
    {
      kind: 'notice',
      tone: 'critical',
      title: 'Reclassificar para C se:',
      text: RECLASSIFY_TO_C_TEXT,
    },
  ],
  C: [
    {
      kind: 'notice',
      tone: 'critical',
      title: 'Conduta imediata',
      text: 'Hidratação IV: SF 0,9% ou RL — 10 mL/kg/h por 2 horas. Solicitar hemograma, função renal, hepática, tipagem sanguínea.',
    },
    {
      kind: 'volumes',
      label: 'Fase de expansão (2h)',
      figures: [
        { volume: 'ivHourly', unit: 'mL/h' },
        { volume: 'iv2h', unit: 'mL em 2h' },
      ],
    },
    {
      kind: 'notice',
      tone: 'neutral',
      title: 'Se melhora + Ht queda',
      text: 'Manutenção: 25 mL/kg em 6h ({maintenance6h} mL → {maintenance6h/6} mL/h). Depois 25 mL/kg em 8h.',
    },
    {
      kind: 'notice',
      tone: 'attention',
      title: 'Sem melhora',
      text: 'Repetir expansão. Se falhar 2ª vez → manejar como Grupo D.',
    },
  ],
  D: [
    {
      kind: 'notice',
      tone: 'critical',
      title: 'Emergência',
      text: 'SF 0,9% — 20 mL/kg em até 20 min. Repetir até 3x. Dois acessos calibrosos. Considere UTI.',
    },
    {
      kind: 'note',
      title: 'Critérios de dengue grave',
      text: 'Choque (pulso fino, TEC >2s, PA convergente ou hipotensão), hemorragia grave (hematêmese, melena, SNC), disfunção orgânica (AST/ALT >1.000, encefalite, miocardite, IRA).',
    },
    {
      kind: 'volumes',
      label: 'Bolus rápido — 20 mL/kg',
      figures: [{ volume: 'bolus', unit: 'mL por bolus (até 3x)' }],
    },
    {
      kind: 'note',
      title: 'Refratário a cristaloide',
      text: 'Albumina 20%: 0,5-1 g/kg ({albuminLow} a {albuminHigh} mL). Se Ht em queda + choque → hemotransfusão. Se refratário a volume → noradrenalina.',
    },
    { kind: 'note', title: 'Metas de ressuscitação', items: RESUSCITATION_TARGETS },
  ],
};

/** Aviso do passo 4 para os grupos C e D, que não têm fluxo de alta. */
export const TRAIL_INPATIENT_NOTE =
  'Paciente em internação — sem fluxo de alta neste momento. Use os botões de reclassificação conforme evolução clínica.';

/** Grupos cujo passo 4 segue para o passo 5 (alta); C e D param no 4. */
export const TRAIL_GROUPS_WITH_DISCHARGE: readonly DengueGroup[] = ['A', 'B'];

export const TRAIL_STEP_5: readonly DengueBlock[] = [
  {
    kind: 'list',
    items: [
      'Ausência de febre por 24-48h sem antitérmicos',
      'Melhora clínica visível',
      'Hematócrito estável',
      'Plaquetas em ascensão',
      'Estabilidade hemodinâmica por 24h',
      'Hidratação oral adequada',
      'Diurese >0,5 mL/kg/h',
    ],
  },
  {
    kind: 'notice',
    tone: 'attention',
    title: 'Orientar retorno imediato se:',
    text: RETURN_SIGNS_SUMMARY,
  },
  { kind: 'link', to: 'alta', label: 'Ver orientações completas para alta segura →' },
];

// ---------------------------------------------------------------------------
// Manejo por grupos (atalho)
// ---------------------------------------------------------------------------

export const GROUPS_HUB = {
  title: 'Manejo por grupos',
  description: 'Acesso direto ao manejo por classificação',
} as const;

// ---------------------------------------------------------------------------
// Classificação direta
// ---------------------------------------------------------------------------

/** Pergunta de cada passo da classificação direta e para onde cada resposta leva. */
export interface DirectQuestion {
  step: 1 | 2 | 3;
  tone: ResultTone;
  title: string;
  question: string;
  detail?: string;
  yes: { label: string; group: DengueGroup };
  /** "Não" abre o próximo passo; no último, leva ao grupo. */
  no: { label: string; group?: DengueGroup };
}

export interface DirectClassificationContent {
  title: string;
  subtitle: string;
  alarmSection: { title: string; badge: SectionBadge; text: string; alarmNotice: string };
  tourniquetSection: DengueSection & { badge: SectionBadge };
  flowTitle: string;
  questions: readonly [DirectQuestion, DirectQuestion, DirectQuestion];
}

export const DIRECT_CLASSIFICATION: DirectClassificationContent = {
  title: 'Classificação clínica',
  subtitle: 'Ministério da Saúde, 6ª edição (2024)',
  alarmSection: {
    title: 'Sinais de alarme',
    badge: { label: 'Avaliar', tone: 'critical' },
    text: 'Marque os sinais presentes. A presença de **qualquer um** indica pelo menos Grupo C.',
    alarmNotice: 'Classificar como pelo menos Grupo C. Iniciar hidratação IV.',
  },
  tourniquetSection: {
    title: 'Prova do laço',
    badge: { label: 'Técnica', tone: 'neutral' },
    blocks: [
      {
        kind: 'steps',
        items: [
          { title: 'Aferir PA', text: 'Insufle o manguito até o ponto médio entre PAS e PAD.' },
          {
            title: 'Manter por 5 minutos',
            text: 'Manter o manguito insuflado no ponto médio. Em crianças, considere 3 minutos.',
          },
          {
            title: 'Contar petéquias',
            text: 'Desenhe um quadrado de 2,5 x 2,5 cm no antebraço e conte as petéquias.',
          },
        ],
      },
      {
        kind: 'notice',
        tone: 'critical',
        title: 'Positiva',
        text: '≥ 20 petéquias em adultos no quadrado. Considere fragilidade capilar — não exclui nem confirma dengue isoladamente.',
      },
      {
        kind: 'note',
        title: 'Atenção',
        text: 'A prova do laço pode ser negativa em pacientes obesos, em choque ou uso de anti-hipertensivos. Não substitui avaliação clínica e laboratorial.',
      },
    ],
  },
  flowTitle: 'Fluxo de classificação',
  questions: [
    {
      step: 1,
      tone: 'neutral',
      title: 'Passo 1',
      question: 'Há sinais de gravidade? (choque, sangramento grave, disfunção orgânica grave)',
      yes: { label: 'Sim → Grupo D', group: 'D' },
      no: { label: 'Não → Próximo' },
    },
    {
      step: 2,
      tone: 'attention',
      title: 'Passo 2',
      question: 'Há sinais de alarme? (use o checklist acima)',
      yes: { label: 'Sim → Grupo C', group: 'C' },
      no: { label: 'Não → Próximo' },
    },
    {
      step: 3,
      tone: 'neutral',
      title: 'Passo 3',
      question: 'Há condição de risco?',
      detail:
        'Gestante, <2 anos ou >65 anos, comorbidades (HAS, DM, DPOC, doença hematológica, renal crônica, doença péptica, hepatopatia), risco social',
      yes: { label: 'Sim → Grupo B', group: 'B' },
      no: { label: 'Não → Grupo A', group: 'A' },
    },
  ],
};

// ---------------------------------------------------------------------------
// Manejo de cada grupo
// ---------------------------------------------------------------------------

export const GROUP_PAGES: Record<DengueGroup, DengueScreenContent> = {
  A: {
    title: 'Grupo A',
    subtitle: 'Sem sinais de alarme, sem condições de risco',
    intro: [
      {
        kind: 'notice',
        tone: 'neutral',
        title: 'Conduta',
        text: 'Hidratação oral domiciliar + acompanhamento ambulatorial',
      },
    ],
    sections: [
      {
        title: 'Hidratação oral',
        blocks: [
          {
            kind: 'volumes',
            label: 'Volume total: 60 mL/kg/dia',
            figures: [{ volume: 'oralTotal', unit: 'mL/dia', detail: ORAL_HYDRATION_SPLIT }],
          },
          {
            kind: 'note',
            title: 'Orientação prática',
            text: 'Considere oferecer água, suco de frutas, chá, água de coco. Evitar bebidas com cafeína. O volume diário inclui alimentação líquida. Distribuir ao longo do dia (não forçar grandes volumes de uma vez).',
          },
        ],
      },
      {
        title: 'Antieméticos',
        blocks: [
          {
            kind: 'note',
            title: 'Metoclopramida',
            text: '10 mg IV ou VO, a cada 8 horas. Ampola: 10 mg/2 mL.',
          },
          {
            kind: 'note',
            title: 'Ondansetrona',
            text: '4-8 mg IV ou VO, a cada 8 horas. Ampola: 4 mg/2 mL ou 8 mg/4 mL.',
          },
          {
            kind: 'notice',
            tone: 'neutral',
            title: 'Nota',
            text: 'Considere antieméticos se vômitos dificultarem a hidratação oral. Evitar anti-inflamatórios não esteroidais (AINEs) e ácido acetilsalicílico.',
          },
        ],
      },
      {
        title: 'Retorno e sinais de alarme',
        badge: { label: 'Importante', tone: 'attention' },
        blocks: [
          {
            kind: 'paragraph',
            text: 'Orientar o paciente a retornar **imediatamente** se apresentar qualquer um dos seguintes:',
          },
          { kind: 'list', items: RETURN_SIGNS },
          { kind: 'link', to: 'alta', label: 'Gerar orientações para WhatsApp →' },
        ],
      },
    ],
    outro: [
      DISCHARGE_TO_SCREEN,
      { kind: 'reclassify', to: 'B', label: 'Identificou condição de risco → Grupo B' },
      { kind: 'reclassify', to: 'C', label: 'Evoluiu com sinais de alarme → Grupo C' },
    ],
  },
  B: {
    title: 'Grupo B',
    subtitle: 'Sem sinais de alarme, com condição de risco',
    intro: [
      {
        kind: 'notice',
        tone: 'attention',
        title: 'Conduta',
        text: 'Hidratação oral supervisionada em unidade de saúde por pelo menos 6 horas. Solicitar hemograma com hematócrito.',
      },
    ],
    sections: [
      {
        title: 'Condições de risco',
        blocks: [
          {
            kind: 'list',
            items: [
              'Gestante',
              'Idade <2 anos ou >65 anos',
              'Hipertensão arterial ou outras doenças cardiovasculares',
              'Diabetes mellitus',
              'DPOC',
              'Doença hematológica (anemia falciforme, etc.)',
              'Doença renal crônica',
              'Doença ácido-péptica',
              'Hepatopatia',
              'Doença autoimune',
              'Uso de anticoagulantes',
              'Risco social ou comorbidade não listada',
            ],
          },
        ],
      },
      {
        title: 'Hidratação e monitorização',
        blocks: [
          {
            kind: 'volumes',
            label: 'Hidratação oral: 60 mL/kg/dia',
            figures: [
              {
                volume: 'oralTotal',
                unit: 'mL/dia',
                detail: { kind: 'text', text: '1/3 SRO + 2/3 líquidos' },
              },
            ],
          },
          {
            kind: 'notice',
            tone: 'neutral',
            title: 'Acompanhamento',
            text: 'Hemograma com hematócrito antes da hidratação e após (em 4-6h). Se o Ht estiver estável e sem sinais de alarme, considere alta com orientações. Se Ht subindo, considere reclassificar para Grupo C.',
          },
        ],
      },
    ],
    outro: [
      {
        kind: 'notice',
        tone: 'critical',
        title: 'Reclassificar para Grupo C se:',
        text: RECLASSIFY_TO_C_TEXT,
      },
      DISCHARGE_TO_SCREEN,
      { kind: 'reclassify', to: 'A', label: 'Sem critérios de risco → Grupo A' },
      { kind: 'reclassify', to: 'C', label: 'Sinais de alarme → Grupo C' },
    ],
  },
  C: {
    title: 'Grupo C',
    subtitle: 'Com sinais de alarme — iniciar reposição volêmica imediata',
    intro: [
      {
        kind: 'notice',
        tone: 'critical',
        title: 'Conduta imediata',
        text: 'Hidratação IV: 10 mL/kg/h por 2 horas (fase de expansão). Solicitar hemograma, função renal, hepática, tipagem sanguínea.',
      },
    ],
    sections: [
      {
        title: 'Fase de expansão (primeiras 2h)',
        blocks: [
          {
            kind: 'volumes',
            label: 'SF 0,9% ou RL — 10 mL/kg/h x 2h',
            figures: [
              { volume: 'ivHourly', unit: 'mL/h' },
              { volume: 'iv2h', unit: 'mL em 2h' },
            ],
          },
        ],
      },
      {
        title: 'Reavaliação após 2h',
        badge: { label: 'Decisão', tone: 'attention' },
        blocks: [
          { kind: 'paragraph', text: 'Reavaliar clinicamente e repetir hematócrito:' },
          {
            kind: 'notice',
            tone: 'neutral',
            title: 'Melhora clínica + Ht em queda',
            text: 'Reduzir para fase de manutenção: 25 mL/kg em 6h. Reavaliar em 6h. Se mantiver melhora, passar para 25 mL/kg em 8h (etapa final).',
          },
          {
            kind: 'notice',
            tone: 'attention',
            title: 'Sem melhora ou Ht em ascensão (aumento ≥20% do basal)',
            text: 'Repetir fase de expansão (10 mL/kg/h por mais 2h). Repetir Ht a cada 2-4h durante expansão. Se não houver melhora após segunda expansão, manejar como Grupo D.',
          },
          {
            kind: 'volumes',
            label: 'Fase de manutenção',
            figures: [
              { caption: '25 mL/kg em 6h', volume: 'maintenance6h', unit: 'mL total' },
              { caption: '25 mL/kg em 8h', volume: 'maintenance8h', unit: 'mL total' },
            ],
          },
          { kind: 'reclassify', to: 'D', label: 'Sem resposta → Grupo D' },
        ],
      },
      {
        title: 'Monitorização durante observação',
        blocks: [
          {
            kind: 'note',
            title: 'Parâmetros de monitorização',
            items: [
              'Sinais vitais a cada 1-2h',
              'Ht de controle a cada 4-6h',
              'Repetir Ht a cada 2-4h durante expansão',
              'Diurese (alvo >0,5 mL/kg/h)',
              'Balanço hídrico a cada 6h',
            ],
          },
        ],
      },
      {
        title: 'Reavaliação seriada',
        blocks: [
          {
            kind: 'note',
            title: 'Após cada fase de expansão',
            items: [
              'Checar PA, FC, TEC, diurese',
              'Se melhora: passar para manutenção',
              'Se piora: reclassificar para Grupo D',
            ],
          },
        ],
      },
      {
        title: 'Fase crítica (defervescência)',
        badge: { label: 'Atenção', tone: 'critical' },
        blocks: CRITICAL_PHASE,
      },
      {
        title: 'Critérios para considerar UTI',
        blocks: [{ kind: 'list', items: ICU_CRITERIA }],
      },
    ],
    outro: [
      { kind: 'reclassify', to: 'D', label: 'Sinais de gravidade → Grupo D' },
      { kind: 'reclassify', to: 'B', label: 'Melhora clínica → Grupo B' },
    ],
  },
  D: {
    title: 'Grupo D',
    subtitle: 'Dengue grave — choque, hemorragia grave ou disfunção orgânica',
    intro: [
      {
        kind: 'notice',
        tone: 'critical',
        title: 'Emergência',
        // ANY: "Iniciar reposição volêmica agressiva imediatamente." (ADR-017, linguagem de sugestão)
        text: 'Considere iniciar reposição volêmica agressiva sem demora. Acesso venoso calibroso (dois acessos). Considere UTI.',
      },
    ],
    sections: [
      {
        title: 'Critérios de dengue grave',
        blocks: [
          {
            kind: 'list',
            items: [
              'Choque: pulso rápido e fino, TEC >2s, PA convergente (≤20 mmHg) ou hipotensão, extremidades frias',
              'Hemorragia grave: hematêmese, melena volumosa, sangramento do SNC',
              'Disfunção orgânica: hepatite (AST/ALT >1.000), encefalite, miocardite, insuficiência renal aguda',
            ],
          },
        ],
      },
      {
        title: 'Fase de expansão rápida',
        badge: { label: 'Urgente', tone: 'critical' },
        blocks: [
          {
            kind: 'volumes',
            label: 'SF 0,9% — 20 mL/kg em até 20 minutos',
            figures: [
              {
                volume: 'bolus',
                unit: 'mL por bolus',
                detail: { kind: 'text', text: 'Pode repetir até 3 vezes' },
              },
            ],
          },
          {
            kind: 'notice',
            tone: 'attention',
            title: 'Reavaliação contínua',
            text: 'Após cada bolus: PA, FC, TEC, diurese, Ht. Se melhora → transição para fase de manutenção do Grupo C (25 mL/kg em 6h).',
          },
        ],
      },
      {
        title: 'Refratário a cristaloide',
        badge: { label: 'Escalar', tone: 'critical' },
        blocks: [
          {
            kind: 'steps',
            items: [
              {
                title: 'Albumina 20%',
                text: 'Se Ht em ascensão (aumento ≥20% do valor basal) após 3 expansões com cristaloide. Considere 0,5-1 g/kg. Repetir Ht a cada 2-4h durante expansão.',
              },
            ],
          },
          {
            kind: 'volumes',
            label: 'Albumina 20% — 0,5 a 1 g/kg',
            figures: [
              { caption: '0,5 g/kg', volume: 'albuminLow', unit: 'mL' },
              { caption: '1 g/kg', volume: 'albuminHigh', unit: 'mL' },
            ],
            note: 'Apresentação: frasco 50 mL (20% = 10 g/frasco)',
          },
          {
            kind: 'steps',
            start: 2,
            items: [
              {
                title: 'Se Ht em queda + choque persistente',
                text: 'Sugere hemorragia. Considere hemotransfusão (CH) e investigar foco hemorrágico.',
              },
              {
                title: 'Noradrenalina',
                text: 'Se choque refratário a volume (após reposição adequada). Considere acesso venoso central.',
              },
            ],
          },
          { kind: 'note', title: 'Metas de ressuscitação', items: RESUSCITATION_TARGETS },
        ],
      },
      {
        title: 'Monitorização intensiva',
        badge: { label: 'Contínua', tone: 'critical' },
        blocks: [
          {
            kind: 'note',
            title: 'Parâmetros de monitorização',
            items: [
              'Sinais vitais contínuos ou a cada 15-30 min',
              'Ht de controle a cada 2h durante expansão',
              'Diurese por sonda vesical (alvo >0,5 mL/kg/h)',
              'Balanço hídrico rigoroso',
              'Considerar acesso venoso central e PAI',
            ],
          },
        ],
      },
      { title: 'Critérios para UTI', blocks: [{ kind: 'list', items: ICU_CRITERIA }] },
      {
        title: 'Complicações a monitorizar',
        badge: { label: 'Atenção', tone: 'critical' },
        blocks: [
          {
            kind: 'list',
            items: [
              'CIVD: monitorar fibrinogênio, D-dímero, TP',
              'Miocardite: ECG, troponina, eco se disponível',
              'Hepatite grave: AST/ALT >1000',
              'Síndrome hemofagocítica: ferritina, triglicerídeos',
            ],
          },
        ],
      },
      { title: 'Fase crítica (defervescência)', blocks: CRITICAL_PHASE },
    ],
    outro: [{ kind: 'reclassify', to: 'C', label: 'Estabilizou → Grupo C' }],
  },
};

// ---------------------------------------------------------------------------
// Calculadoras
// ---------------------------------------------------------------------------

export const CALCULATORS_PAGE: DengueScreenContent = {
  title: 'Calculadoras',
  sections: [
    {
      title: 'Hidratação oral (Grupo A)',
      badge: { label: '60 mL/kg/dia', tone: 'neutral' },
      blocks: [
        {
          kind: 'note',
          title: 'Indicação',
          text: 'Volume: 60 mL/kg/dia (1/3 com SRO). Distribuir ao longo do dia. Inclui alimentação líquida.',
        },
        {
          kind: 'volumes',
          label: 'Volume total diário',
          figures: [
            { volume: 'oralTotal', unit: 'mL/dia' },
            { caption: '1/3 SRO', volume: 'oralSro', unit: 'mL' },
            { caption: '2/3 Líquidos', volume: 'oralLiquids', unit: 'mL' },
          ],
        },
      ],
    },
    {
      title: 'Hidratação IV — expansão (Grupos C/D)',
      badge: { label: 'Expansão', tone: 'critical' },
      blocks: [
        {
          kind: 'note',
          title: 'Protocolo de expansão',
          items: [
            'Fase de expansão: 20 mL/kg em 2h (cristaloide isotônico)',
            'Reavaliação após cada fase',
            'Se melhora: manutenção 25 mL/kg em 6h',
            'Se não melhora: repetir expansão (máximo 3 expansões)',
          ],
        },
        {
          kind: 'volumes',
          label: 'Expansão — 20 mL/kg em 20 min (Grupo D) ou 10 mL/kg/h x 2h (Grupo C)',
          figures: [
            { caption: 'Bolus 20 mL/kg', volume: 'bolus', unit: 'mL' },
            { caption: '10 mL/kg/h', volume: 'ivHourly', unit: 'mL/h' },
            { caption: 'Volume em 2h (Grupo C)', volume: 'iv2h', unit: 'mL' },
          ],
        },
      ],
    },
    {
      title: 'Hidratação IV — manutenção',
      badge: { label: 'Manutenção', tone: 'attention' },
      blocks: [
        {
          kind: 'note',
          title: 'Protocolo de manutenção',
          items: [
            '25 mL/kg em 6h (primeira fase)',
            'Depois 25 mL/kg em 8h (segunda fase)',
            'Reduzir conforme melhora clínica',
          ],
        },
        {
          kind: 'volumes',
          label: 'Manutenção — 25 mL/kg',
          figures: [
            {
              caption: '25 mL/kg em 6h',
              volume: 'maintenance6h',
              unit: 'mL',
              detail: { kind: 'rate', volume: 'maintenance6h', hours: 6 },
            },
            {
              caption: '25 mL/kg em 8h',
              volume: 'maintenance8h',
              unit: 'mL',
              detail: { kind: 'rate', volume: 'maintenance8h', hours: 8 },
            },
          ],
        },
      ],
    },
    {
      title: 'Albumina (reposição coloidosmótica)',
      badge: { label: 'Refratário', tone: 'critical' },
      blocks: [
        {
          kind: 'notice',
          tone: 'critical',
          title: 'Atenção',
          text: 'Albumina NÃO é hidratação — é para choque refratário após 3 expansões com cristaloide.',
        },
        {
          kind: 'note',
          title: 'Indicação e dose',
          items: [
            'Dose: 0,5-1 g/kg (albumina 20%)',
            'Indicação: choque refratário a cristaloide + Ht em queda',
            'Apresentação: frasco 50 mL (20% = 10 g/frasco)',
          ],
        },
        {
          kind: 'volumes',
          label: 'Albumina 20% — 0,5 a 1 g/kg',
          figures: [
            {
              caption: '0,5 g/kg',
              volume: 'albuminLow',
              unit: 'mL',
              detail: { kind: 'vials', volume: 'albuminLow' },
            },
            {
              caption: '1 g/kg',
              volume: 'albuminHigh',
              unit: 'mL',
              detail: { kind: 'vials', volume: 'albuminHigh' },
            },
          ],
        },
      ],
    },
    {
      title: 'Cálculo de variação do Ht',
      badge: { label: 'Monitorização', tone: 'attention' },
      blocks: [
        { kind: 'hematocrit' },
        {
          kind: 'note',
          title: 'Classificação',
          items: ['<20%: variação normal', '≥20%: hemoconcentração significativa'],
        },
        {
          kind: 'note',
          title: 'Referência',
          text: 'Homens: ~45% (40-54%). Mulheres: ~40% (36-48%). Ex: Ht basal 40% → Ht atual ≥48% = hemoconcentração significativa.',
        },
      ],
    },
  ],
};

/** Rótulos da calculadora de variação do hematócrito. */
export const HEMATOCRIT_FORM = {
  label: 'Variação do hematócrito (%)',
  formula: 'Fórmula: (Ht atual - Ht basal) / Ht basal x 100',
  baseline: { label: 'Ht basal (%)', placeholder: '45' },
  current: { label: 'Ht atual (%)', placeholder: '54' },
  resultUnit: '% de variação',
  pending: 'Insira os valores de Ht',
} as const;

// ---------------------------------------------------------------------------
// E-FASD
// ---------------------------------------------------------------------------

const ACCURACY_HEAD = ['Acurácia', 'Valor'] as const;

export const EFASD_PAGE: DengueScreenContent = {
  title: 'POCUS / E-FASD',
  subtitle: 'Extended Focused Assessment Sonography in Dengue — Tambelli et al., JBMEDE 2024',
  intro: [
    {
      kind: 'notice',
      tone: 'neutral',
      title: 'Objetivo',
      text: 'Rastrear sinais de extravasamento plasmático e gravidade em pacientes com dengue, à beira-leito.',
    },
  ],
  sections: [
    {
      title: 'Preparação',
      blocks: [
        {
          kind: 'list',
          items: [
            'Transdutor: Curvilínea (2,5-5 MHz). Alternativa: setorial',
            'Preset: Abdominal',
            'Posição do paciente: Decúbito dorsal a 0 graus',
            'Indicador da sonda: Para a direita ou cranial em relação ao paciente',
            'Posição Trendelenburg: Opcional — aumenta sensibilidade no andar superior do abdome',
          ],
        },
      ],
    },
    {
      title: 'Janelas 1 e 2 — Pulmão anterior',
      badge: { label: 'Intersticial', tone: 'neutral' },
      blocks: [
        {
          kind: 'note',
          title: 'Avaliação de síndrome intersticial pulmonar',
          text: 'Sonda na caixa torácica anterior, linha hemiclavicular, marcador cranial. Visualizar a linha pleural entre duas costelas. Profundidade: 3-5 cm (linha pleural) → ajustar para 8-12 cm (linhas B). Repetir em ambos os hemitórax.',
        },
        {
          kind: 'notice',
          tone: 'critical',
          title: 'E-FASD positivo',
          text: '≥ 3 linhas B entre duas costelas → possível extravasamento plasmático ou sobrecarga volêmica.',
        },
        {
          kind: 'table',
          head: ['Acurácia do POCUS', 'Valor'],
          rows: [
            ['Sensibilidade', '98%'],
            ['Especificidade', '88%'],
          ],
        },
      ],
    },
    {
      title: 'Janelas 3 e 4 — QSD (ascite + DP direito)',
      badge: { label: 'Morrison', tone: 'neutral' },
      blocks: [
        {
          kind: 'note',
          title: 'Janela 3 — Ascite à direita',
          text: 'Sonda com marcador cefálico na linha axilar posterior direita, transição toracoabdominal. Rotacionar 15-20 graus se costelas atrapalharem. Avaliar: espaço de Morrison, borda caudal do fígado, espaço supra-hepático. Líquido anecoico nesses espaços → E-FASD positivo.',
        },
        {
          kind: 'note',
          title: 'Janela 4 — Derrame pleural D',
          text: 'Mover a sonda cranialmente. Conteúdo anecoico acima do diafragma + sinal da coluna → derrame pleural confirmado.',
        },
        {
          kind: 'table',
          head: ['Achado', 'Sens.', 'Esp.'],
          rows: [
            ['Ascite (J3)', '90%', '99%'],
            ['Derrame pleural (J4)', '94%', '97%'],
          ],
        },
      ],
    },
    {
      title: 'Janela 5 — Vesícula biliar',
      badge: { label: 'Gravidade', tone: 'attention' },
      blocks: [
        {
          kind: 'note',
          title: 'Avaliação da parede da vesícula biliar',
          text: 'Sonda na região anterior do QSD, abaixo da última costela, paralela à linha mediana, marcador cefálico. Movimento pendular suave. Avaliar a parede **anterior** da vesícula.',
        },
        {
          kind: 'notice',
          tone: 'critical',
          title: 'E-FASD positivo',
          text: 'Parede >3 mm de espessura e/ou líquido perivesicular → correlaciona-se com gravidade e extravasamento plasmático.',
        },
        {
          kind: 'notice',
          tone: 'attention',
          title: 'Atenção',
          text: 'Espessamento da vesícula biliar não exclui necessidade de investigar diagnósticos diferenciais de patologias biliares.',
        },
        {
          kind: 'table',
          head: ACCURACY_HEAD,
          rows: [
            ['Sensibilidade', '94%'],
            ['Especificidade', '91%'],
          ],
        },
      ],
    },
    {
      title: 'Janelas 6 e 7 — QSE (ascite + DP esquerdo)',
      blocks: [
        {
          kind: 'note',
          title: 'Janela 6 — Ascite à esquerda',
          text: 'Sonda com marcador cefálico na linha axilar posterior esquerda (mais posterior que no QSD — o baço é mais posterior que o fígado). Avaliar espaço subdiafragmático (mais sensível) e esplenorrenal.',
        },
        {
          kind: 'note',
          title: 'Janela 7 — Derrame pleural E',
          text: 'Mover cranialmente. Conteúdo anecoico + sinal da coluna acima do diafragma → derrame pleural.',
        },
        {
          kind: 'notice',
          tone: 'neutral',
          title: 'Dica',
          text: 'Considere solicitar pausa inspiratória ao paciente para melhor visualização. O ligamento esplenorrenal limita o líquido no espaço entre baço e rim — o espaço subdiafragmático é mais sensível para detecção.',
        },
      ],
    },
    {
      title: 'Janela 8 — Retrovesical (pelve)',
      blocks: [
        {
          kind: 'note',
          title: 'Avaliação de ascite pélvica',
          text: 'Sonda na linha média suprapúbica, marcador cefálico (longitudinal), depois rotacionar 90 graus (transversal). Preferencialmente com bexiga cheia (antes da sonda vesical). Identificar bexiga, útero ou próstata, reto. Líquido anecoico ao redor → E-FASD positivo.',
        },
      ],
    },
    {
      title: 'Janela 9 — Subcostal (pericárdio)',
      blocks: [
        {
          kind: 'note',
          title: 'Avaliação de derrame pericárdico',
          text: 'Sonda paralela à pele, região subxifoide, feixe de US apontando para o ombro esquerdo. Profundidade: 15-20 cm. Usar o fígado como janela acústica. Conteúdo anecoico no espaço pericárdico → derrame pericárdico.',
        },
        {
          kind: 'notice',
          tone: 'attention',
          title: 'Dificuldades',
          text: 'Pode ser difícil em obesos, distensão abdominal, xifoide proeminente ou ascite volumosa. Considere outras janelas cardíacas (paraesternal, apical).',
        },
        {
          kind: 'table',
          head: ACCURACY_HEAD,
          rows: [
            ['Sensibilidade', '96%'],
            ['Especificidade', '98%'],
          ],
        },
      ],
    },
    {
      title: 'Resumo — Tabela de acurácia',
      blocks: [
        {
          kind: 'table',
          head: ['Janela', 'Achado', 'Sens.', 'Esp.'],
          rows: [
            ['1-2', 'Síndrome intersticial', '98%', '88%'],
            ['3, 6, 8', 'Ascite', '90%', '99%'],
            ['4, 7', 'Derrame pleural', '94%', '97%'],
            ['5', 'Espessamento vesicular', '94%', '91%'],
            ['9', 'Derrame pericárdico', '96%', '98%'],
          ],
        },
        {
          kind: 'notice',
          tone: 'neutral',
          title: 'Limitação',
          text: 'O E-FASD não diagnostica nem classifica gravidade isoladamente. É uma ferramenta de triagem complementar à avaliação clínica e laboratorial.',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Exames e diagnósticos diferenciais
// ---------------------------------------------------------------------------

/** Seções da tela de exames; `heading` abre um subgrupo ("Diagnósticos diferenciais"). */
export interface ExamSection extends DengueSection {
  heading?: string;
}

export const EXAMS_PAGE: { title: string; subtitle: string; sections: readonly ExamSection[] } = {
  title: 'Exames e diagnósticos diferenciais',
  subtitle: 'Laboratório, monitorização e diagnósticos diferenciais',
  sections: [
    {
      heading: 'Exames laboratoriais',
      title: 'Exames sugeridos na dengue',
      blocks: [
        {
          kind: 'list',
          items: [
            'Hemograma completo com hematócrito',
            'Coagulograma (TP, TTPa, fibrinogênio)',
            'Função renal (ureia, creatinina)',
            'Função hepática (AST, ALT, albumina)',
            'Tipagem sanguínea',
            'Lactato',
            'Gasometria arterial (se grave)',
            'NS1 (até 5º dia) / IgM (a partir do 6º dia)',
          ],
        },
      ],
    },
    {
      title: 'Exames por grupo',
      blocks: [
        {
          kind: 'table',
          head: ['Grupo', 'Exames sugeridos'],
          rows: [
            [{ group: 'A' }, 'Hemograma (não obrigatório). Orientar retorno se sinais de alarme.'],
            [{ group: 'B' }, 'Hemograma com Ht obrigatório. Repetir em 4-6h.'],
            [
              { group: 'C' },
              'Hemograma seriado (Ht a cada 2h na expansão). Função renal, hepática, coagulograma, tipagem sanguínea.',
            ],
            [
              { group: 'D' },
              'Hemograma seriado, função renal e hepática, coagulograma (TP, TTPa, fibrinogênio), tipagem + reserva, gasometria, lactato. Rx de tórax se disponível.',
            ],
          ],
        },
      ],
    },
    {
      title: 'Interpretação do hematócrito',
      badge: { label: 'Parâmetro-chave', tone: 'attention' },
      blocks: [
        {
          kind: 'notice',
          tone: 'attention',
          title: 'Ht em ascensão (aumento ≥20% do valor basal)',
          text: 'Sugere hemoconcentração por extravasamento plasmático. Escalar tratamento (maior aporte de volume). Referência: homem ~45%, mulher ~40%. Ex: Ht basal 40% → Ht atual ≥48% = alarme.',
        },
        {
          kind: 'notice',
          tone: 'neutral',
          title: 'Ht em queda com melhora clínica',
          text: 'Sugere reabsorção plasmática. Considere reduzir velocidade de infusão.',
        },
        {
          kind: 'notice',
          tone: 'critical',
          title: 'Ht em queda com piora clínica',
          text: 'Sugere hemorragia. Investigar sangramento e considere hemotransfusão.',
        },
        {
          kind: 'note',
          title: 'Valores de referência',
          text: 'Homens: ~45% (referência: 40-54%). Mulheres: ~40% (referência: 36-48%). Fórmula: (Ht atual - Ht basal) / Ht basal x 100. Elevação ≥20% sugere hemoconcentração significativa. Repetir Ht a cada 2-4h durante expansão (Grupos C/D). Monitorizar a cada 12-24h no Grupo B.',
        },
      ],
    },
    {
      title: 'Plaquetas',
      blocks: [
        {
          kind: 'note',
          title: 'Classificação da plaquetopenia na dengue',
          items: [
            'Plaquetopenia: <100.000/mm³ (critério de risco — Grupo B)',
            'Plaquetopenia grave: <50.000/mm³ (considere avaliação de hemostasia)',
            'Plaquetopenia crítica: <20.000/mm³ (risco de sangramento espontâneo)',
          ],
        },
        {
          kind: 'note',
          title: 'Conduta',
          text: 'Isoladamente, a plaquetopenia não indica gravidade nem necessidade de transfusão de plaquetas. A decisão de transfundir deve ser individualizada e baseada em sangramento ativo, não no número absoluto.',
        },
        {
          kind: 'notice',
          tone: 'critical',
          title: 'Atenção',
          text: 'Considere transfusão de plaquetas apenas se sangramento ativo grave com plaquetopenia <50.000/mm³. Evitar transfusão profilática — não há evidência de benefício na dengue.',
        },
      ],
    },
    {
      heading: 'Diagnósticos diferenciais',
      title: 'Diagnósticos diferenciais principais',
      blocks: [
        {
          kind: 'list',
          items: [
            'Outras arboviroses (Zika, Chikungunya)',
            'Leptospirose',
            'Meningococcemia',
            'Febre maculosa',
            'Malária',
            'Hepatites virais',
            'Influenza / COVID-19',
          ],
        },
      ],
    },
    {
      title: 'Comparativo entre arboviroses',
      blocks: [
        {
          kind: 'table',
          head: ['Achado', 'Dengue', 'Zika', 'Chikungunya'],
          rows: [
            ['Febre', 'Alta (>38,5 °C)', 'Baixa ou ausente', 'Alta'],
            ['Exantema', 'Tardio (3-5º dia)', 'Precoce (1-2º dia)', '2-5º dia'],
            ['Artralgia', 'Leve', 'Leve', 'Intensa (incapacitante)'],
            ['Mialgia', 'Intensa', 'Leve', 'Moderada'],
            ['Conjuntivite', 'Raro', 'Frequente', 'Raro'],
            ['Cefaleia', 'Intensa (retroorbitária)', 'Leve', 'Moderada'],
          ],
        },
      ],
    },
    {
      title: 'Complicações da dengue',
      badge: { label: 'Atenção', tone: 'critical' },
      blocks: [
        {
          kind: 'list',
          items: [
            'Miocardite: arritmias, disfunção ventricular, troponina elevada',
            'Encefalite: rebaixamento do nível de consciência, convulsões',
            'Hepatite: AST/ALT >1.000, pode evoluir para insuficiência hepática',
            'CIVD: coagulograma alargado, fibrinogênio baixo, sangramento difuso',
            'Rabdomiólise: CPK elevada, IRA',
            'Síndrome hemofagocítica: febre persistente, citopenias, ferritina muito elevada',
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Alta segura
// ---------------------------------------------------------------------------

export const DISCHARGE_PAGE: DengueScreenContent = {
  title: 'Orientações para alta segura',
  sections: [
    {
      title: 'Critérios de alta hospitalar',
      blocks: [
        {
          kind: 'list',
          items: [
            'Ausência de febre por 24-48h sem uso de antitérmicos',
            'Melhora clínica visível',
            'Hematócrito estável (sem hemoconcentração)',
            'Plaquetas em ascensão (tendência de melhora)',
            'Estabilidade hemodinâmica por 24h',
            'Capacidade de manter hidratação oral adequada',
            'Diurese adequada (>0,5 mL/kg/h)',
          ],
        },
      ],
    },
    {
      title: 'Orientações ao paciente',
      blocks: [
        {
          kind: 'list',
          items: [
            'Manter hidratação oral abundante (60 mL/kg/dia)',
            'Repouso relativo',
            'Usar apenas paracetamol ou dipirona se febre ou dor (evitar AINEs e AAS)',
            'Retorno para reavaliação conforme orientação médica',
          ],
        },
        { kind: 'paragraph', text: 'Retornar **imediatamente** se sinais de alarme' },
        { kind: 'paragraph', muted: true, text: '**Sinais de alarme para retorno imediato:**' },
        {
          kind: 'list',
          tone: 'critical',
          items: [
            'Dor abdominal intensa e contínua',
            'Vômitos persistentes',
            'Sangramento (gengiva, nariz, fezes escuras, urina escura)',
            'Tontura ou desmaio ao levantar',
            'Pele fria, pálida ou pegajosa',
            'Dificuldade para respirar',
            'Sonolência excessiva ou agitação intensa',
          ],
        },
      ],
    },
  ],
};

export const PATIENT_MESSAGE_UI = {
  generate: 'Gerar orientações para WhatsApp',
  generated: 'Mensagem gerada — sem dado do paciente',
  copy: 'Copiar mensagem',
  copied: 'Mensagem copiada.',
  share: 'Enviar no WhatsApp',
} as const;

// ---------------------------------------------------------------------------
// Referências
// ---------------------------------------------------------------------------

export const DENGUE_REFERENCES = [
  'Brasil. Ministério da Saúde. Dengue: diagnóstico e manejo clínico — adulto e criança. 6ª edição. Brasília, 2024.',
  'Associação Brasileira de Medicina de Emergência (ABRAMEDE). Recomendações para manejo de dengue no departamento de emergência.',
  'World Health Organization. Dengue: guidelines for diagnosis, treatment, prevention and control. WHO, 2009 (atualizada 2012).',
  'Tambelli RA, Silva PS, Schubert DU, et al. Extended Focused Assessment Sonography in Dengue (E-FASD): protocolo de ultrassom point of care para avaliação de pacientes com dengue. JBMEDE. 2024;4(1):e24005.',
  'Tejo AM, Hamasaki DT, Menezes LM, Ho YL. Severe dengue in the intensive care unit. J Intensive Med. 2023;4(1):16-33.',
] as const;

/** Linha curta das fontes principais, no rodapé de toda tela. */
export const DENGUE_REFERENCES_SHORT = 'MS 6ª ed. (2024) · ABRAMEDE · OMS (2009/2012)';
