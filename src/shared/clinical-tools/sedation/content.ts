import type { ContentProvenance } from '../provenance';
import type { ResultTone } from '../tone';
import type { RegimenId } from './doses';

/**
 * Roteiro de sedação procedimental e do paciente agitado (CC-328) como dado:
 * as 13 telas do SedaPath do ANY App v4, as escolhas de cada uma, os avisos,
 * os checklists e os red flags. A tela só desenha; nenhum texto clínico mora
 * em componente (ADR-017). Doses e regimes estão em `doses.ts`.
 *
 * O texto portado teve acentuação corrigida, "Ketamina"/"Ketofol" viraram
 * "Cetamina"/"Cetofol" (nome da DCB, o mesmo da Via aérea) e recomendação no
 * imperativo passou para a forma de sugestão ("considere …"). Passos de
 * conduta no infinitivo ("Reunir equipe e definir papéis") descrevem o
 * procedimento e ficaram como no ANY. Doses, limiares e critérios são os do ANY.
 */

export const ANY_V4_SEDATION_SOURCE = 'ANY App v4 · SedaPath.tsx (95c8fba)';

export const SEDATION_PROVENANCE: ContentProvenance = {
  source: ANY_V4_SEDATION_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

// ---- Telas ------------------------------------------------------------------

export const SEDATION_SCREENS = [
  'triagem',
  'colaborativo',
  'sem-sedacao',
  'sedacao-vo',
  'pouco-colaborativo',
  'urgente',
  'im-urgente',
  'nao-urgente',
  'combativo',
  'preparo-iv',
  'cetofol',
  'durante',
  'pos',
] as const;

export type SedationScreen = (typeof SEDATION_SCREENS)[number];

export function isSedationScreen(value: unknown): value is SedationScreen {
  return typeof value === 'string' && (SEDATION_SCREENS as readonly string[]).includes(value);
}

/** Título da tela e rótulo curto na trilha (o breadcrumb do ANY). */
export const SCREEN_INFO: Record<SedationScreen, { title: string; trail: string }> = {
  triagem: { title: 'Avaliação inicial', trail: 'Triagem' },
  colaborativo: { title: 'Paciente colaborativo', trail: 'Colaborativo' },
  'sem-sedacao': { title: 'Procedimento sem sedação', trail: 'Sem sedação' },
  'sedacao-vo': { title: 'Sedação leve — via oral', trail: 'Sedação VO' },
  'pouco-colaborativo': { title: 'Pouco colaborativo', trail: 'Pouco colaborativo' },
  urgente: { title: 'Urgente — sedação rápida', trail: 'Urgente' },
  'im-urgente': { title: 'Sedação IM — onset rápido', trail: 'IM urgente' },
  'nao-urgente': { title: 'Não urgente — Haloperidol + Prometazina IM', trail: 'Não urgente' },
  combativo: { title: 'Combativo / Agitação grave', trail: 'Combativo' },
  'preparo-iv': { title: 'Preparo para sedação IV', trail: 'Preparo IV' },
  cetofol: { title: 'Cetofol 1:1', trail: 'Cetofol' },
  durante: { title: 'Durante a sedação', trail: 'Durante' },
  pos: { title: 'Pós-sedação', trail: 'Pós-sedação' },
};

// ---- Escolhas (os cartões de opção do ANY) ----------------------------------

export const SEDATION_CHOICE_IDS = [
  'colaborativo',
  'pouco-colaborativo',
  'combativo',
  'sem-sedacao',
  'precisa-sedacao',
  'vo-suficiente',
  'vo-insuficiente',
  'urgente',
  'nao-urgente',
  'com-acesso-iv',
  'sem-acesso-iv',
  'sedacao-adequada',
  'complementar',
  'contencao-suficiente',
  'sedacao-iv-adicional',
] as const;

export type SedationChoiceId = (typeof SEDATION_CHOICE_IDS)[number];

export interface SedationChoice {
  title: string;
  description: string;
  /** Tela que a escolha abre. */
  target: SedationScreen;
  /**
   * Peso da escolha pela cor do ANY: verde `neutral`, amarelo `attention`,
   * vermelho `critical`. `null` onde o ANY usava a cor de destaque, sem
   * significado de gravidade.
   */
  tone: ResultTone | null;
  /** "Insuficiente" depois da VO: o paciente já recebeu sedação (reduz o cetofol). */
  marksOralSedationFailed?: true;
}

export const SEDATION_CHOICES: Record<SedationChoiceId, SedationChoice> = {
  colaborativo: {
    title: 'Colaborativo',
    description: 'Aceita orientações, permite acesso venoso e monitorização',
    target: 'colaborativo',
    tone: 'neutral',
  },
  'pouco-colaborativo': {
    title: 'Pouco colaborativo',
    description: 'Agitado, não permite procedimentos, sem risco iminente',
    target: 'pouco-colaborativo',
    tone: 'attention',
  },
  combativo: {
    title: 'Combativo / Agitação grave',
    description: 'Risco imediato para equipe ou para si',
    target: 'combativo',
    tone: 'critical',
  },
  'sem-sedacao': {
    title: 'Não — procedimento sem sedação',
    description: 'Paciente consegue ficar imóvel, tolera o procedimento',
    target: 'sem-sedacao',
    tone: 'neutral',
  },
  'precisa-sedacao': {
    title: 'Sim — precisa de sedação',
    description: 'Ansiedade, dificuldade de imobilização, dor não controlada',
    target: 'sedacao-vo',
    tone: null,
  },
  'vo-suficiente': {
    title: 'Suficiente',
    description: 'Paciente calmo, tolera procedimento',
    target: 'sem-sedacao',
    tone: 'neutral',
  },
  'vo-insuficiente': {
    title: 'Insuficiente',
    description: 'Escalonar para sedação IV (cetofol)',
    target: 'preparo-iv',
    tone: 'attention',
    marksOralSedationFailed: true,
  },
  urgente: {
    title: 'Urgente — preciso agora',
    description: 'Trauma, suspeita de lesão aguda, TC imediata necessária',
    target: 'urgente',
    tone: 'critical',
  },
  'nao-urgente': {
    title: 'Não urgente — posso aguardar 20–40 min',
    description: 'Situação controlada, aguardar efeito do IM',
    target: 'nao-urgente',
    tone: 'attention',
  },
  'com-acesso-iv': {
    title: 'Sim — tem acesso IV',
    description: 'Usar cetofol IV (onset 1–2 min)',
    target: 'preparo-iv',
    tone: 'neutral',
  },
  'sem-acesso-iv': {
    title: 'Não — sem acesso IV',
    description: 'Escolher sedação IM de onset rápido',
    target: 'im-urgente',
    tone: 'attention',
  },
  'sedacao-adequada': {
    title: 'Sedação adequada',
    description: 'Pode realizar procedimento',
    target: 'durante',
    tone: 'neutral',
  },
  complementar: {
    title: 'Precisa complementar',
    description: 'Escalonar para cetofol IV',
    target: 'preparo-iv',
    tone: 'attention',
  },
  'contencao-suficiente': {
    title: 'Contenção suficiente',
    description: 'Paciente estável, monitorar evolução',
    target: 'pos',
    tone: 'neutral',
  },
  'sedacao-iv-adicional': {
    title: 'Preciso de sedação IV adicional',
    description: 'Escalonar para cetofol IV',
    target: 'preparo-iv',
    tone: 'attention',
  },
};

export interface ChoiceSection {
  /** Título do bloco de escolhas ("Urgência da intervenção"). */
  title?: string;
  /** Pergunta acima das opções. */
  prompt?: string;
  choices: readonly SedationChoiceId[];
}

/** Onde cada escolha aparece, na ordem do ANY. Uma seção por tela. */
export const CHOICE_SECTIONS: Partial<Record<SedationScreen, ChoiceSection>> = {
  triagem: {
    prompt: 'Qual a situação atual do paciente?',
    choices: ['colaborativo', 'pouco-colaborativo', 'combativo'],
  },
  colaborativo: { choices: ['sem-sedacao', 'precisa-sedacao'] },
  'sedacao-vo': {
    title: 'Após 20–30 minutos — avalie a resposta',
    choices: ['vo-suficiente', 'vo-insuficiente'],
  },
  'pouco-colaborativo': {
    title: 'Urgência da intervenção',
    prompt: 'O exame/procedimento precisa ser feito agora?',
    choices: ['urgente', 'nao-urgente'],
  },
  urgente: { prompt: 'Paciente tem acesso venoso?', choices: ['com-acesso-iv', 'sem-acesso-iv'] },
  'nao-urgente': {
    title: 'Após 20–40 minutos — avalie resposta',
    choices: ['sedacao-adequada', 'complementar'],
  },
  combativo: {
    title: 'Após estabilização inicial',
    prompt: 'Precisa de sedação adicional para procedimento?',
    choices: ['contencao-suficiente', 'sedacao-iv-adicional'],
  },
};

/** Botão de avançar das telas sem cartão de opção (o "→" do ANY). */
export const SEDATION_NEXT: Partial<
  Record<SedationScreen, { label: string; target: SedationScreen }>
> = {
  'im-urgente': { label: 'Durante sedação', target: 'durante' },
  'preparo-iv': { label: 'Calcular cetofol', target: 'cetofol' },
  cetofol: { label: 'Iniciar sedação', target: 'durante' },
  durante: { label: 'Pós-sedação', target: 'pos' },
};

/** Telas finais: o ANY oferece "Novo paciente". */
export const FINAL_SCREENS: readonly SedationScreen[] = ['sem-sedacao', 'pos'];

// ---- Avisos -----------------------------------------------------------------

/** `info` é o azul do ANY; os demais seguem o tom do resultado (ADR-017). */
export type SedationNoticeTone = 'info' | ResultTone;

export interface SedationNotice {
  tone: SedationNoticeTone;
  title: string;
  lines: readonly string[];
}

/** Regime em destaque (o quadro com borda do ANY): o primeiro é o principal, os demais "ou …". */
export interface RegimenCard {
  title: string;
  regimens: readonly RegimenId[];
  notes: readonly string[];
}

/** Opção de medicação (o `MedOption` do ANY). O título e a dose saem do regime. */
export interface MedicationOption<Id extends string> {
  id: Id;
  regimen: RegimenId;
  /** Início e duração de ação. */
  timing: string;
  /** Quando preferir esta opção ("Preferir se: …"). */
  preferIf?: string;
}

export const PREFER_IF_LABEL = 'Preferir se:';

export const URGENT_IM_DRUGS = ['cetamina', 'midazolam'] as const;
export type UrgentImDrug = (typeof URGENT_IM_DRUGS)[number];

export const COMBATIVE_REGIMENS = ['cetamina', 'midazolam-haloperidol-prometazina'] as const;
export type CombativeRegimen = (typeof COMBATIVE_REGIMENS)[number];

const KETAMINE_TIMING = 'Onset: 3–5 min | Duração: 15–30 min';

/** Pergunta da sedação recente. O ANY faz a mesma pergunta em duas telas, com textos um pouco diferentes. */
export const RECENT_SEDATION_QUESTION = {
  'pouco-colaborativo': 'Paciente já recebeu sedação nas últimas 4 h?',
  'preparo-iv': 'Paciente recebeu sedação nas últimas 4 h?',
} as const;

export const YES_NO = { yes: 'Sim', no: 'Não' } as const;

export const COLLABORATIVE = {
  question: 'A sedação é realmente necessária?',
  hint: 'Avalie se o paciente consegue tolerar o procedimento sem sedação',
} as const;

export const NO_SEDATION = {
  result: 'Procedimento sem sedação',
  detail: 'Paciente colaborativo — sedação não necessária',
  tip: {
    tone: 'info',
    title: 'Dica',
    lines: [
      'Considere manter comunicação clara com o paciente durante o procedimento e explicar cada etapa.',
    ],
  } satisfies SedationNotice,
} as const;

export const ORAL_SEDATION = {
  card: {
    title: 'Opções de sedação VO',
    regimens: ['midazolam-vo', 'clonazepam-vo'],
    notes: ['Aguardar 20–30 minutos para efeito'],
  } satisfies RegimenCard,
  pain: {
    tone: 'info',
    title: 'Se dor associada',
    lines: ['Considere reforço analgésico (dipirona, tramadol, morfina conforme intensidade)'],
  } satisfies SedationNotice,
} as const;

export const LOW_COOPERATION = {
  deescalation: {
    tone: 'info',
    title: 'Primeiro: desescalonamento verbal',
    lines: [
      'Tom calmo e acolhedor, sem julgamentos',
      'Considere reduzir estímulos (som, pessoas)',
      'Perguntas abertas: "Como posso ajudar?"',
    ],
  } satisfies SedationNotice,
  /** Sem sedação nas últimas 4 h: VO antes do IM. */
  oralFirst: {
    title: 'Considere VO primeiro (se aceitar)',
    regimens: ['clonazepam-vo'],
    notes: ['Aguardar 30 minutos. Se aceitar, pode ser suficiente.'],
  } satisfies RegimenCard,
  oralFailure: {
    tone: 'attention',
    title: 'Se falha da VO ou paciente recusa',
    lines: ['Avalie urgência da intervenção abaixo'],
  } satisfies SedationNotice,
  alreadySedated: {
    tone: 'attention',
    title: 'Já recebeu sedação e não foi suficiente',
    lines: ['Avalie urgência da intervenção abaixo'],
  } satisfies SedationNotice,
} as const;

export const URGENT = {
  alert: {
    tone: 'critical',
    title: 'Preciso de onset rápido',
    lines: ['Não posso aguardar 20–40 min do haloperidol IM'],
  } satisfies SedationNotice,
} as const;

export const URGENT_IM = {
  intro: {
    tone: 'info',
    title: 'Sem acesso IV',
    lines: ['Escolha a medicação conforme indicação e contraindicações'],
  } satisfies SedationNotice,
  legend: 'Medicação IM',
  options: [
    {
      id: 'cetamina',
      regimen: 'cetamina-im',
      timing: KETAMINE_TIMING,
      preferIf: 'drogas sintéticas (K2, K9), falha de outras medicações, intoxicação alcoólica',
    },
    { id: 'midazolam', regimen: 'midazolam-im', timing: 'Onset: imediato | Meia-vida: 1–2 h' },
  ] satisfies readonly MedicationOption<UrgentImDrug>[],
  midazolamCaution: {
    tone: 'critical',
    title: 'Considere evitar midazolam se:',
    lines: ['Intoxicação alcoólica / Risco de rebaixamento respiratório / Gestante'],
  } satisfies SedationNotice,
} as const;

export const NON_URGENT = {
  card: {
    title: 'Haloperidol + Prometazina IM',
    regimens: ['haloperidol-prometazina-im'],
    notes: [
      'Onset: 20–40 minutos',
      'Pode repetir haloperidol em 30 min (máx. 40 mg/dia)',
      'Em gestantes: prometazina máx. 100 mg/dia',
    ],
  } satisfies RegimenCard,
} as const;

export const COMBATIVE = {
  risk: {
    tone: 'critical',
    title: 'Risco imediato',
    lines: [
      'Reunir equipe e definir papéis',
      'Preparar contenção mecânica',
      'Abordar em grupo',
      'Não conter mecanicamente sem contenção química',
    ],
  } satisfies SedationNotice,
  legend: 'Escolha a contenção química:',
  options: [
    {
      id: 'cetamina',
      regimen: 'cetamina-im',
      timing: KETAMINE_TIMING,
      preferIf: 'drogas sintéticas (K2, K9), intoxicação alcoólica, necessidade de onset rápido',
    },
    {
      id: 'midazolam-haloperidol-prometazina',
      regimen: 'midazolam-haloperidol-prometazina-im',
      timing:
        'Onset midazolam: imediato | Onset haloperidol + prometazina: 20–40 min | Duração: 4–6 h',
    },
  ] satisfies readonly MedicationOption<CombativeRegimen>[],
  midazolamContraindication: {
    tone: 'critical',
    title: 'Contraindicação ao midazolam?',
    lines: ['Intoxicação alcoólica, risco respiratório, gestante → considere apenas cetamina IM'],
  } satisfies SedationNotice,
} as const;

/** Calculadora da cetamina IM (urgente sem acesso IV e combativo). */
export const KETAMINE_CALCULATOR = {
  title: 'Calculadora cetamina IM',
  doseLabel: 'Dose total',
  volumeLabel: 'Volume (50 mg/mL)',
} as const;

// ---- Preparo IV e red flags -------------------------------------------------

export const RED_FLAG_IDS = ['trauma', 'via-aerea-dificil', 'instabilidade', 'jejum'] as const;
export type RedFlagId = (typeof RED_FLAG_IDS)[number];

export interface RedFlag {
  id: RedFlagId;
  title: string;
  /** Destaque no topo do alerta. */
  emphasis?: string;
  paragraphs: readonly string[];
  listTitle?: string;
  items: readonly string[];
  /** Mostra o atalho para a Via aérea (quando ela estiver disponível no Copiloto). */
  airwayLink?: true;
}

export const IV_PREPARATION = {
  environment: {
    tone: 'critical',
    title: 'Ambiente obrigatório',
    lines: [
      'Sala de emergência / ambiente crítico, com monitor multiparamétrico e recursos para intervenção de via aérea.',
      'Responsável: Emergencista',
    ],
  } satisfies SedationNotice,
  /** Depois de "Insuficiente" na VO: a pergunta das 4 h some e fica este aviso. */
  oralGiven: {
    tone: 'attention',
    title: 'Paciente já recebeu sedação VO',
    lines: ['Considere doses reduzidas de cetofol e titule conforme resposta.'],
  } satisfies SedationNotice,
  reducedSuggestion: {
    tone: 'info',
    title: 'Considere doses reduzidas de cetofol',
    lines: ['Titular conforme resposta.'],
  } satisfies SedationNotice,
  redFlagsTitle: 'Red flags',
  redFlagsHint: 'Marque as condições presentes para ver alertas específicos',
} as const;

/** Red flags do preparo IV, na ordem do ANY; o detalhe aparece com o item marcado. */
export const RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'trauma',
    title: 'Trauma + suspeita de intoxicação',
    emphasis: 'Alto risco de broncoaspiração',
    paragraphs: ['Gastroparesia do trauma, posição supina, colar cervical.'],
    listTitle: 'Considere IOT programada antes da sedação:',
    items: [
      'Aspirador testado e à mão',
      'Trendelenburg reverso se possível',
      'Equipe preparada para via aérea definitiva',
    ],
  },
  {
    id: 'via-aerea-dificil',
    title: 'Via aérea difícil antecipada',
    paragraphs: [
      'Sinais: obesidade, Mallampati ≥ 3, pescoço curto, barba cheia, limitação de abertura bucal.',
    ],
    items: [
      'Material de VAD preparado',
      'Videolaringoscópio se disponível',
      'Considere IOT programada antes da sedação',
    ],
    airwayLink: true,
  },
  {
    id: 'instabilidade',
    title: 'Instabilidade hemodinâmica',
    paragraphs: [],
    items: [
      'Considere otimizar antes da sedação (volume, vasopressor)',
      'Considere doses reduzidas',
      'Cetamina isolada pode ser mais estável hemodinamicamente',
    ],
  },
  {
    id: 'jejum',
    title: 'Jejum inadequado',
    paragraphs: [],
    items: [
      'Em emergência, não atrasar sedação por jejum',
      'Pondere risco-benefício',
      'Considere otimizar proteção de via aérea',
    ],
  },
];

// ---- Cetofol ----------------------------------------------------------------

export const KETOFOL_SCREEN = {
  preparationTitle: 'Preparo da solução',
  totalLabel: 'Volume final',
  concentrationLabel: 'Concentração:',
  dosesTitle: 'Cálculo de doses',
  /** Com sedação nas últimas 4 h ou VO insuficiente. */
  reduced: {
    tone: 'attention',
    title: 'Considere doses reduzidas (50%)',
    lines: ['Sedação prévia nas últimas 4 h. Titular conforme resposta.'],
  } satisfies SedationNotice,
  standardTitle: 'Dose padrão',
  inductionTitle: 'Dose de indução',
  inductionDoseLabel: 'Cetamina + Propofol',
  inductionVolumeLabel: 'Volume da solução',
  maintenanceTitle: 'Manutenção (se necessário)',
  maintenanceDoseLabel: 'Dose',
  maintenanceVolumeLabel: 'Volume',
  maintenanceRepeat: 'Repetir a cada 3–5 min conforme necessidade',
} as const;

// ---- Durante e depois -------------------------------------------------------

export const DURING = {
  monitoringTitle: 'Monitorização obrigatória',
  monitoring: [
    { title: 'SpO2 contínuo', detail: 'Manter oxímetro visível e com alarme' },
    { title: 'PA e FC', detail: 'Aferir a cada 3–5 minutos' },
    { title: 'Nível de consciência', detail: 'Resposta a estímulos verbais e táteis' },
  ],
  complicationsTitle: 'Intercorrências',
  complications: [
    { tone: 'attention', title: 'Hipotensão', lines: ['Fluidos, considere vasopressor'] },
    {
      tone: 'attention',
      title: 'Dessaturação',
      lines: [
        '1. Reposicionar VA, chin lift/jaw thrust',
        '2. O2 suplementar (máscara com reservatório)',
        '3. Considere BVM',
        '4. Se não reverter com medidas não invasivas → considere IOT',
      ],
    },
    { tone: 'attention', title: 'Agitação emergente', lines: ['Dose adicional de cetofol'] },
  ] satisfies readonly SedationNotice[],
} as const;

// ---- Checklists -------------------------------------------------------------

export const SEDATION_CHECKLIST_IDS = [
  'apos-im-urgente',
  'enquanto-aguarda',
  'pos-contencao',
  'materiais',
  'equipe',
  'alta',
  'retirada-contencao',
] as const;

export type SedationChecklistId = (typeof SEDATION_CHECKLIST_IDS)[number];

export interface SedationChecklist {
  screen: SedationScreen;
  title: string;
  /** Aberto ao chegar na tela, como o `defaultOpen` do ANY. */
  defaultOpen: boolean;
  /** Texto e aviso antes dos itens (retirada da contenção). */
  intro?: string;
  notice?: SedationNotice;
  items: readonly { id: string; title: string }[];
}

export const SEDATION_CHECKLISTS = {
  'apos-im-urgente': {
    screen: 'im-urgente',
    title: 'Após administração',
    defaultOpen: false,
    items: [
      { id: 'urg-monitor', title: 'Monitorização contínua (SpO2, FC)' },
      { id: 'urg-va', title: 'Material de via aérea disponível' },
      { id: 'urg-acesso', title: 'Obter acesso IV assim que possível' },
      { id: 'urg-aguardar', title: 'Aguardar onset para procedimento' },
    ],
  },
  'enquanto-aguarda': {
    screen: 'nao-urgente',
    title: 'Checklist enquanto aguarda',
    defaultOpen: true,
    items: [
      { id: 'ub-perfusao', title: 'Verificar perfusão das extremidades (se contido)' },
      { id: 'ub-sv', title: 'Aferir sinais vitais a cada 15–30 min' },
      { id: 'ub-acesso', title: 'Obter acesso venoso quando possível' },
      { id: 'ub-material', title: 'Preparar material para procedimento' },
    ],
  },
  'pos-contencao': {
    screen: 'combativo',
    title: 'Checklist pós-contenção',
    defaultOpen: false,
    items: [
      { id: 'nc-perfusao', title: 'Verificar perfusão extremidades 30/30 min' },
      { id: 'nc-sv', title: 'Sinais vitais a cada 1 hora' },
      { id: 'nc-acesso', title: 'Obter acesso IV quando possível' },
      { id: 'nc-reavaliar', title: 'Reavaliar necessidade de contenção mecânica' },
    ],
  },
  materiais: {
    screen: 'preparo-iv',
    title: 'Materiais',
    defaultOpen: false,
    items: [
      { id: 'mat-monitor', title: 'Monitorização (oxímetro, PA, cardioscópio)' },
      { id: 'mat-va', title: 'Via aérea (BVM, cânulas, laringoscópio, TOT)' },
      { id: 'mat-asp', title: 'Aspirador funcionando' },
      { id: 'mat-acesso', title: 'Acesso venoso calibroso e pérvio' },
      { id: 'mat-carro', title: 'Acesso ao carro de emergência' },
    ],
  },
  equipe: {
    screen: 'preparo-iv',
    title: 'Equipe',
    defaultOpen: false,
    items: [
      { id: 'eq-monitor', title: 'Profissional dedicado à monitorização' },
      { id: 'eq-va', title: 'Profissional capaz de manejar via aérea' },
    ],
  },
  alta: {
    screen: 'pos',
    title: 'Critérios de alta da sedação',
    defaultOpen: true,
    items: [
      { id: 'alta-alerta', title: 'Alerta e orientado' },
      { id: 'alta-sv', title: 'Sinais vitais estáveis' },
      { id: 'alta-deambula', title: 'Deambulando sem apoio (ou baseline)' },
      { id: 'alta-nausea', title: 'Sem náusea ou vômito' },
    ],
  },
  'retirada-contencao': {
    screen: 'pos',
    title: 'Foi necessária contenção mecânica?',
    defaultOpen: false,
    intro:
      'Se o paciente foi contido mecanicamente, siga a sequência abaixo para retirada gradual:',
    notice: {
      tone: 'info',
      title: 'Aguardar 15 minutos entre cada liberação.',
      lines: ['Reavaliar necessidade de retomar contenção a cada etapa.'],
    },
    items: [
      { id: 'cont-torax', title: '1. Liberar contenção torácica' },
      { id: 'cont-mi1', title: '2. Liberar um membro inferior — aguardar 15 min' },
      { id: 'cont-mi2', title: '3. Liberar outro membro inferior — aguardar 15 min' },
      { id: 'cont-ms', title: '4. Liberar membros superiores por último' },
    ],
  },
} as const satisfies Record<SedationChecklistId, SedationChecklist>;

export type SedationCheckId =
  (typeof SEDATION_CHECKLISTS)[SedationChecklistId]['items'][number]['id'];

export const SEDATION_CHECK_IDS: readonly SedationCheckId[] = SEDATION_CHECKLIST_IDS.flatMap(
  (checklist) => SEDATION_CHECKLISTS[checklist].items.map(({ id }) => id),
);

const CHECKLIST_OF = new Map<string, SedationChecklistId>(
  SEDATION_CHECKLIST_IDS.flatMap((checklist) =>
    SEDATION_CHECKLISTS[checklist].items.map(({ id }) => [id, checklist] as const),
  ),
);

export function isSedationCheckId(value: unknown): value is SedationCheckId {
  return typeof value === 'string' && CHECKLIST_OF.has(value);
}

export function checklistOf(id: SedationCheckId): SedationChecklistId {
  const checklist = CHECKLIST_OF.get(id);
  if (!checklist) throw new Error(`Item "${id}" fora dos checklists da sedação.`);
  return checklist;
}
