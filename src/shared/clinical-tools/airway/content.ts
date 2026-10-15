import type { ContentProvenance } from '../provenance';
import type { ResultTone } from '../tone';

/**
 * Roteiro de via aérea (CC-315) como dado: passos, itens de avaliação,
 * checklists, técnicas e avisos do AirwayGuide do ANY App v4. A tela só
 * desenha; nenhum texto clínico mora em componente (ADR-017).
 *
 * O texto portado teve acentuação corrigida e recomendação no imperativo
 * passada para a forma de sugestão ("considere …"). Passos de técnica
 * ("Inserir lâmina pela direita…") descrevem o procedimento e ficaram como no
 * ANY. Doses, limiares e critérios estão em `drugs.ts`, `devices.ts` e
 * `vitals.ts`, iguais ao ANY.
 */

export const ANY_V4_AIRWAY_SOURCE = 'ANY App v4 · AirwayGuide.tsx (95c8fba)';

export const AIRWAY_PROVENANCE: ContentProvenance = {
  source: ANY_V4_AIRWAY_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

/** `title` é o nome curto (trilha de passos); `heading`, o título da tela do passo. */
export const AIRWAY_STEPS = [
  { number: 1, id: 'indicacao', title: 'Indicação', heading: 'Indicação de IOT' },
  { number: 2, id: 'crash', title: 'CRASH', heading: 'VAD fisiológica — CRASH' },
  { number: 3, id: 'vad-anatomica', title: 'VAD anatômica', heading: 'VAD anatômica' },
  { number: 4, id: 'dados', title: 'Dados', heading: 'Dados do paciente' },
  { number: 5, id: 'triple-setup', title: 'Triple setup', heading: 'Triple setup' },
  { number: 6, id: 'otimizacao', title: 'Otimização', heading: 'Otimização' },
  { number: 7, id: 'pre-oxigenacao', title: 'Pré-oxigenação', heading: 'Pré-oxigenação' },
  { number: 8, id: 'medicacoes', title: 'Medicações', heading: 'Medicações' },
  { number: 9, id: 'procedimento', title: 'Procedimento', heading: 'Procedimento' },
  {
    number: 10,
    id: 'resultado',
    title: 'Resultado',
    heading: 'Resultado e confirmação',
  },
  { number: 11, id: 'resumo', title: 'Resumo', heading: 'Resumo' },
] as const;

export type AirwayStepNumber = (typeof AIRWAY_STEPS)[number]['number'];
export const FIRST_STEP: AirwayStepNumber = 1;
export const LAST_STEP: AirwayStepNumber = 11;

export function isAirwayStep(value: unknown): value is AirwayStepNumber {
  return AIRWAY_STEPS.some(({ number }) => number === value);
}

/** Item marcável com título e detalhe opcional. */
export interface AirwayItem<Id extends string = string> {
  id: Id;
  title: string;
  detail?: string;
}

// ---- Passo 1: indicação ------------------------------------------------------

export const INDICATIONS = [
  {
    id: 'protecao',
    title: 'Falha em manter/proteger via aérea',
    detail: 'Rebaixamento, obstrução, risco de aspiração',
    summary: 'Falha em manter/proteger VA',
  },
  {
    id: 'oxigenacao',
    title: 'Falha de ventilação ou oxigenação',
    detail: 'Hipoxemia refratária, fadiga, hipercapnia',
    summary: 'Falha de ventilação/oxigenação',
  },
  {
    id: 'curso-antecipado',
    title: 'Curso clínico antecipado',
    detail: 'Queimadura de VA, angioedema, procedimento',
    summary: 'Curso clínico antecipado',
  },
] as const satisfies readonly (AirwayItem & { summary: string })[];

export type IndicationId = (typeof INDICATIONS)[number]['id'];

// ---- Passo 2: CRASH (VAD fisiológica) ---------------------------------------

export const CRASH_LETTERS = ['C', 'R', 'A', 'S', 'H'] as const;
export type CrashLetter = (typeof CRASH_LETTERS)[number];

export interface CrashItem extends AirwayItem<CrashLetter> {
  /** Sugestões mostradas quando a letra está marcada. */
  suggestions: readonly string[];
}

export const CRASH_ITEMS: readonly CrashItem[] = [
  {
    id: 'C',
    title: 'C — Consumo de O2 aumentado',
    detail: 'Febre, sepse, agitação, trabalho respiratório aumentado',
    suggestions: [
      'Considere otimizar a pré-oxigenação, prolongando-a',
      'Oxigenação apneica recomendada',
      'Dessaturação rápida é esperada',
    ],
  },
  {
    id: 'R',
    title: 'R — Falência de VD',
    detail: 'TEP, HAP, IAM de VD, SDRA grave',
    suggestions: [
      'Considere evitar hipóxia e hipercapnia',
      'Considere vasopressor precoce',
      'Considere cetamina como indutor',
    ],
  },
  {
    id: 'A',
    title: 'A — Acidose metabólica',
    detail: 'pH < 7,2, lactato elevado, padrão de Kussmaul',
    suggestions: [
      'Considere corrigir a causa de base antes, se possível',
      'Considere minimizar o tempo de apneia',
      'Considere manter ventilação-minuto alta após a IOT',
    ],
  },
  {
    id: 'S',
    title: 'S — Saturação comprometida',
    detail: 'SpO₂ < 93% mesmo com O2 suplementar',
    suggestions: [
      'Considere VNI/CNAF durante o preparo, se tolerado',
      'Considere DSI (delayed sequence intubation)',
      'Considere oxigenação apneica a 15 L/min',
    ],
  },
  {
    id: 'H',
    title: 'H — Hipotensão / Hipovolemia',
    detail: 'PAS < 90, má perfusão, índice de choque > 1,0',
    suggestions: [
      'Considere ressuscitação volêmica antes, se possível',
      'Considere vasopressor preparado ou iniciado',
      'Considere reduzir a dose do indutor (50%)',
      'Considere ter push-dose pressor à mão',
    ],
  },
];

// ---- Passo 3: VAD anatômica (LEMON e ROMAN) ---------------------------------

export const LEMON_ITEMS = [
  {
    id: 'L',
    title: 'L — Look externally',
    detail: 'Impressão geral de VA difícil, trauma facial, barba',
  },
  {
    id: 'E',
    title: 'E — Evaluate 3-3-2',
    detail: 'Abertura oral < 3 dedos, mento-hioide < 3, tireo-hioide < 2',
  },
  {
    id: 'M',
    title: 'M — Mallampati ≥ III',
    detail: 'Visualização limitada de estruturas orofaríngeas',
  },
  {
    id: 'O',
    title: 'O — Obstruction / Obesity',
    detail: 'Massa, epiglotite, obesidade (IMC > 30)',
  },
  { id: 'N', title: 'N — Neck mobility', detail: 'Rigidez cervical, colar, artrite, espondilite' },
] as const satisfies readonly AirwayItem[];

export type LemonId = (typeof LEMON_ITEMS)[number]['id'];

export const ROMAN_ITEMS = [
  {
    id: 'R',
    title: 'R — Radiation / Restriction',
    detail: 'Radioterapia cervical, complacência pulmonar reduzida',
  },
  {
    id: 'O',
    title: 'O — Obstruction / Obesity / OSA',
    detail: 'Obstrução de VA, obesidade, apneia do sono',
  },
  {
    id: 'M',
    title: 'M — Mask seal / Male',
    detail: 'Barba, trauma facial, edentulismo, sexo masculino',
  },
  { id: 'A', title: 'A — Age > 55 anos', detail: 'Alterações anatômicas relacionadas à idade' },
  { id: 'N', title: 'N — No teeth', detail: 'Edentulismo dificulta a vedação da máscara' },
] as const satisfies readonly AirwayItem[];

export type RomanId = (typeof ROMAN_ITEMS)[number]['id'];

/** LEMON ou ROMAN com 2 ou mais itens: via aérea difícil (regra do ANY). */
export const DIFFICULT_AIRWAY_MIN_PREDICTORS = 2;

// ---- Passo 4: dados do paciente ---------------------------------------------

export const POPULATIONS = [
  { id: 'adulto', label: 'Adulto' },
  { id: 'idoso', label: 'Idoso (≥ 65)' },
  { id: 'obeso', label: 'Obeso' },
  { id: 'gestante', label: 'Gestante' },
] as const;

export type AirwayPopulation = (typeof POPULATIONS)[number]['id'];

export const SEXES = [
  { id: 'M', label: 'Masculino' },
  { id: 'F', label: 'Feminino' },
] as const;

export type BiologicalSex = (typeof SEXES)[number]['id'];

// ---- Checklists (passos 5, 6, 7 e 10, e o checklist avulso) -----------------

export interface AirwayChecklist {
  id: string;
  title: string;
  items: readonly (AirwayItem & {
    /** Detalhe calculado pela tela a partir do paciente (tamanho do tubo, do DEG). */
    detailFrom?: 'tubo' | 'dispositivo-extraglotico';
    /** Como o item aparece no resumo, quando entra nele. */
    summary?: string;
  })[];
}

export const CHECKLISTS = {
  // Checklist de IOT avulso (tela "Checklist")
  paciente: {
    id: 'paciente',
    title: 'Paciente',
    items: [
      { id: 'paciente-acesso', title: 'Acesso venoso funcionante' },
      {
        id: 'paciente-posicionamento',
        title: 'Posicionamento otimizado',
        detail: 'Cabeceira elevada, coxins, posição olfativa',
      },
      {
        id: 'paciente-pre-oxigenacao',
        title: 'Pré-oxigenação',
        detail: '3–5 min, FiO₂ 100% (BMV / VNI / CNAF) + oxigenação apneica',
      },
      {
        id: 'paciente-hemodinamica',
        title: 'Otimização hemodinâmica',
        detail: 'Considere vasopressor ou cristaloide antes da indução',
      },
      { id: 'paciente-membrana', title: 'Membrana cricotireóidea identificada' },
      { id: 'paciente-alergias', title: 'Alergias e contraindicações verificadas' },
    ],
  },
  equipamento: {
    id: 'equipamento',
    title: 'Equipamento',
    items: [
      {
        id: 'equipamento-laringoscopio',
        title: 'Laringoscópio testado',
        detail: 'Videolaringoscópio e/ou lâmina direta',
      },
      { id: 'equipamento-tot', title: 'TOT com cuff testado (2 tamanhos)' },
      { id: 'equipamento-bougie', title: 'Bougie + fio-guia' },
      { id: 'equipamento-bmv', title: 'BMV + circuito + ventilador' },
      { id: 'equipamento-aspiracao', title: 'Aspiração montada e testada' },
      { id: 'equipamento-monitorizacao', title: 'Monitorização completa + capnografia' },
      {
        id: 'equipamento-deg',
        title: 'DEG disponível e lubrificado',
        detail: 'Plano B: máscara laríngea',
      },
      {
        id: 'equipamento-crico',
        title: 'Kit de cricotireoidostomia',
        detail: 'Plano C: bisturi + bougie + TOT 6,0',
      },
    ],
  },
  equipe: {
    id: 'equipe',
    title: 'Equipe',
    items: [
      { id: 'equipe-lider', title: 'Líder / intubador definido' },
      { id: 'equipe-backup', title: 'Médico backup disponível' },
      { id: 'equipe-drogas', title: 'Drogas preparadas e checadas' },
      { id: 'equipe-planos', title: 'Planos A / B / C verbalizados' },
    ],
  },
  posIntubacao: {
    id: 'pos-intubacao',
    title: 'Pós-intubação',
    items: [
      { id: 'pos-capnografia', title: 'Confirmação com capnografia' },
      { id: 'pos-fixacao', title: 'Fixação do tubo + pressão do cuff' },
      { id: 'pos-cabeceira', title: 'Cabeceira elevada + ventilação checada' },
      { id: 'pos-sedacao', title: 'Sedação contínua' },
      { id: 'pos-exames', title: 'Gasometria + Rx de tórax' },
    ],
  },

  // Passo 5: triple setup
  planoA: {
    id: 'plano-a',
    title: 'Plano A — Laringoscopia',
    items: [
      {
        id: 'plano-a-laringoscopio',
        title: 'Laringoscópio testado',
        detail: 'VL e/ou lâmina direta',
      },
      { id: 'plano-a-tubo', title: 'Tubo traqueal + fio-guia', detailFrom: 'tubo' },
      { id: 'plano-a-bougie', title: 'Bougie disponível', detail: 'Disponível e acessível' },
    ],
  },
  planoB: {
    id: 'plano-b',
    title: 'Plano B — DEG',
    items: [
      {
        id: 'plano-b-deg',
        title: 'DEG testado e lubrificado',
        detailFrom: 'dispositivo-extraglotico',
      },
    ],
  },
  planoC: {
    id: 'plano-c',
    title: 'Plano C — Crico',
    items: [
      {
        id: 'plano-c-kit',
        title: 'Kit de crico disponível',
        detail: 'Bisturi + bougie + tubo 6,0',
      },
    ],
  },

  // Passo 6: otimização
  hemodinamica: {
    id: 'otimizacao-hemodinamica',
    title: 'Otimização hemodinâmica',
    items: [
      {
        id: 'otimizacao-acesso',
        title: 'Acesso venoso calibroso',
        detail: 'Jelco 18G ou maior, patência testada',
      },
      {
        id: 'otimizacao-cristaloide',
        title: 'Cristaloide em curso',
        detail: 'SF 0,9% ou RL aberto',
      },
      {
        id: 'otimizacao-vasopressor',
        title: 'Vasopressor disponível',
        detail: 'Preparado ou em infusão',
      },
    ],
  },
  posicionamento: {
    id: 'posicionamento',
    title: 'Posicionamento',
    items: [
      {
        id: 'posicionamento-olfativa',
        title: 'Posição olfativa (sniffing)',
        detail: 'Coxim occipital, ou escapular se obeso',
      },
      {
        id: 'posicionamento-cabeceira',
        title: 'Cabeceira elevada 20–30 graus',
        detail: 'Head-up para obeso ou risco de aspiração',
      },
    ],
  },

  // Passo 7: pré-oxigenação
  preOxigenacao: {
    id: 'pre-oxigenacao',
    title: 'Meta: pré-oxigenação por 3 a 5 minutos com FiO2 de 100%',
    items: [
      { id: 'preox-vni', title: 'VNI (CPAP/BiPAP)', detail: 'FiO2 100%, se tolerar' },
      {
        id: 'preox-mnr',
        title: 'Máscara não reinalante 15 L/min (flush rate)',
        detail: 'Flush rate, se disponível',
      },
      {
        id: 'preox-bvm',
        title: 'BVM com reservatório',
        detail: 'Vedação adequada, respirações espontâneas',
      },
    ],
  },
  oxigenacaoApneica: {
    id: 'oxigenacao-apneica',
    title: 'Oxigenação apneica',
    items: [
      {
        id: 'apneica-cateter',
        title: 'Cateter nasal 15 L/min',
        detail: 'Durante toda a laringoscopia',
      },
    ],
  },

  // Passo 10: confirmação
  confirmacao: {
    id: 'confirmacao',
    title: 'Confirme o posicionamento',
    items: [
      {
        id: 'confirmacao-capnografia',
        title: 'Capnografia',
        detail: 'EtCO2 com curva adequada (padrão-ouro)',
        summary: 'capnografia',
      },
      {
        id: 'confirmacao-ausculta',
        title: 'Ausculta bilateral',
        detail: 'Murmúrio vesicular simétrico, 5 pontos',
        summary: 'ausculta bilateral',
      },
      {
        id: 'confirmacao-expansibilidade',
        title: 'Expansibilidade torácica',
        detail: 'Simétrica bilateralmente',
        summary: 'expansibilidade torácica',
      },
    ],
  },
  pocus: {
    id: 'pocus-confirmatorio',
    title: 'POCUS confirmatório',
    items: [
      {
        id: 'pocus-traqueal',
        title: 'Traqueal (fúrcula esternal)',
        detail:
          'Linear transversal: 1 sinal hiperecogênico (tubo) + esôfago vazio. Se "dupla via": intubação esofágica',
        summary: 'POCUS traqueal',
      },
      {
        id: 'pocus-pulmonar',
        title: 'Pulmonar bilateral',
        detail:
          'Lung sliding presente bilateralmente (se ausente de um lado: seletiva ou pneumotórax)',
        summary: 'POCUS pulmonar bilateral',
      },
    ],
  },
} as const satisfies Record<string, AirwayChecklist>;

type Checklists = typeof CHECKLISTS;
export type AirwayChecklistKey = keyof Checklists;
export type AirwayCheckId = Checklists[AirwayChecklistKey]['items'][number]['id'];

/** Checklist de IOT avulso, na ordem do ANY. */
export const STANDALONE_CHECKLISTS: readonly AirwayChecklistKey[] = [
  'paciente',
  'equipamento',
  'equipe',
  'posIntubacao',
];

export const ALL_CHECK_IDS: readonly AirwayCheckId[] = Object.values(CHECKLISTS).flatMap(
  ({ items }) => items.map(({ id }) => id),
);

export function isAirwayCheckId(value: unknown): value is AirwayCheckId {
  return typeof value === 'string' && (ALL_CHECK_IDS as readonly string[]).includes(value);
}

// ---- Passo 5: membrana cricotireóidea ---------------------------------------

export const MEMBRANE_METHODS = [
  { id: 'palpacao', label: 'Palpação' },
  { id: 'pocus', label: 'POCUS' },
  { id: 'nao', label: 'Não' },
] as const;

export type MembraneMethod = (typeof MEMBRANE_METHODS)[number]['id'];

export const MEMBRANE_TECHNIQUES: Readonly<
  Record<Exclude<MembraneMethod, 'nao'>, { title: string; lines: readonly string[] }>
> = {
  palpacao: {
    title: 'Técnica TACA',
    lines: [
      '1. Palpar a tireoide (proeminência)',
      '2. Deslizar inferiormente até a cricoide',
      '3. Membrana = depressão entre elas',
      '4. Marcar com caneta, se possível',
    ],
  },
  pocus: {
    title: 'Técnica POCUS',
    lines: [
      'Transdutor: linear, alta frequência',
      'Posição: transversal na linha média cervical',
      'Técnica: identificar a tireoide (anecoica em "U") e deslizar caudalmente até a cricoide',
      'Membrana: faixa hiperecoica entre tireoide e cricoide',
      'Dica: marcar a pele sob visualização direta',
    ],
  },
};

// ---- Passo 7: flush rate ----------------------------------------------------

export const FLUSH_RATE = {
  title: 'Flush rate (fluxo máximo)',
  lines: [
    'Abertura total do fluxômetro de O2 (40–60 L/min), além dos 15 L/min convencionais, para maximizar a FiO2 entregue.',
    'Como fazer: 1. conectar o O2 ao fluxômetro; 2. abrir o fluxômetro no máximo (flush rate = 40–60 L/min); 3. manter o reservatório da máscara inflado; 4. garantir vedação adequada da máscara na face.',
    'Benefício: a FiO2 sobe de ~60–70% para ~90%.',
  ],
} as const;

// ---- Passo 9: procedimento --------------------------------------------------

export const LARYNGOSCOPY_TECHNIQUES = [
  {
    id: 'direta',
    label: 'Laringoscopia direta',
    summary: 'laringoscopia direta',
    steps: [
      'Segurar o laringoscópio com a mão esquerda',
      'Abrir a boca com técnica de tesoura (mão direita)',
      'Inserir a lâmina pelo lado direito, varrendo a língua para a esquerda',
      'Avançar até a valécula (base da língua)',
      'Elevar em direção ventral e anterior — nunca alavanca nos dentes',
      'Se visualização inadequada: manobra BURP',
      'Usar bougie ou estilete pré-moldado (fortemente recomendado)',
      'Avançar o tubo pelo canto direito da boca',
      'Insuflar o cuff',
    ],
  },
  {
    id: 'video',
    label: 'Videolaringoscopia',
    summary: 'videolaringoscopia',
    steps: [
      'Inserir a lâmina na linha média sob visão na tela',
      'Avançar até visualizar a epiglote',
      'Posicionar a ponta na valécula ou sob a epiglote',
      'Usar bougie ou estilete pré-moldado (fortemente recomendado)',
      'Avançar o tubo sob visão contínua na tela',
      'Visualizar a passagem entre as cordas vocais',
      'Insuflar o cuff',
    ],
  },
] as const;

export type LaryngoscopyTechnique = (typeof LARYNGOSCOPY_TECHNIQUES)[number]['id'];

export const COMMON_ERRORS: readonly { title: string; detail: string }[] = [
  { title: 'Alavanca nos dentes', detail: 'levantar, nunca rotacionar a lâmina' },
  { title: 'Lâmina superficial demais', detail: 'não chega na valécula, sem visualização' },
  { title: 'Lâmina profunda demais', detail: 'passa a epiglote, perde a referência' },
  { title: 'Tubo pelo centro da boca', detail: 'deve ser pelo canto direito' },
  { title: 'Força excessiva no bougie/tubo', detail: 'avançar com movimentos suaves' },
];

export const CORMACK_GRADES = ['I', 'II', 'III', 'IV'] as const;
export type CormackGrade = (typeof CORMACK_GRADES)[number];

/** Cormack III ou IV: visualização limitada (aviso do passo 9). */
export const LIMITED_VIEW_GRADES: readonly CormackGrade[] = ['III', 'IV'];

// ---- Passo 10: resgate ------------------------------------------------------

export const RESCUE_PLANS = {
  planoB: {
    title: 'Plano B — Dispositivo extraglótico',
    lines: [
      'Máscara laríngea (ML) ou dispositivo supraglótico de 2ª geração',
      'Inserir conforme a técnica padrão e insuflar o cuff',
      'Confirmar a ventilação: EtCO2 + ausculta',
      'Se ventilação adequada: considere intubação através do DEG com fibroscópio',
    ],
  },
  planoC: {
    title: 'Plano C — Cricotireoidostomia',
    lead: 'Técnica cirúrgica (bisturi-bougie-tubo):',
    lines: [
      'Palpar a membrana cricotireóidea (entre as cartilagens tireoide e cricoide)',
      'Incisão vertical na pele (3–4 cm) + incisão horizontal na membrana',
      'Inserir o bougie pela incisão, em direção caudal',
      'Deslizar o tubo 6,0 sobre o bougie',
      'Confirmar a posição: capnografia + ausculta',
    ],
  },
} as const;

export const RESCUE_METHODS = [
  { id: 'deg', label: 'DEG', summary: 'dispositivo extraglótico (plano B)' },
  {
    id: 'cricotireoidostomia',
    label: 'Cricotireoidostomia',
    summary: 'cricotireoidostomia (plano C)',
  },
] as const;

export type RescueMethod = (typeof RESCUE_METHODS)[number]['id'];

export const POST_INTUBATION_SEDATION = {
  title: 'Sedação em infusão contínua',
  detail: 'Calculadora de infusões',
  drugs: 'Fentanil · Propofol · Midazolam · Dexmedetomidina',
} as const;

// ---- Avisos ------------------------------------------------------------------

/**
 * Tom do aviso. `info` é informação (azul na tela); os demais são os tons de
 * resultado do ADR-017: o vermelho do ANY fica crítico, o amarelo vira
 * atenção e o verde vira neutro.
 */
export type AirwayNoticeTone = 'info' | ResultTone;

export interface AirwayNotice {
  tone: AirwayNoticeTone;
  title: string;
  lines: readonly string[];
}

export const NOTICES = {
  pcr: {
    tone: 'info',
    title: 'PCR ou PCR iminente?',
    lines: ['Considere intubação sem RSI (sem drogas), com prioridade para as compressões.'],
  },
  vadFisiologica: {
    tone: 'critical',
    title: 'VAD fisiológica identificada',
    lines: ['Considere otimização antes da indução.'],
  },
  riscoElevado: {
    tone: 'critical',
    title: 'Risco elevado identificado',
    lines: ['Considere confirmar o preparo completo para falha.'],
  },
  vadDificil: {
    tone: 'critical',
    title: 'Via aérea difícil identificada',
    lines: [
      'Considere pedir ajuda precocemente.',
      'Considere limitar a 2 tentativas de laringoscopia.',
      'Se falhar: plano B (dispositivo extraglótico) → plano C (cricotireoidostomia).',
      'Considere manter a oxigenação entre as tentativas.',
    ],
  },
  instabilidade: {
    tone: 'critical',
    title: 'Instabilidade hemodinâmica',
    lines: ['Considere vasopressor antes da indução.'],
  },
  reducaoDose: {
    tone: 'attention',
    title: 'Considere redução de dose',
    lines: ['Paciente com instabilidade/idoso: considere reduzir a dose do indutor em 30–50%.'],
  },
  cormackLimitado: {
    tone: 'critical',
    title: 'Visualização limitada (Cormack III–IV)',
    lines: [
      'Considere bougie como primeira opção.',
      'Considere reposicionar: elevação da cabeça, manipulação laríngea externa (BURP).',
      'Considere videolaringoscópio, se disponível.',
      'Considere limitar a 2 tentativas antes de acionar o plano B.',
    ],
  },
} as const satisfies Record<string, AirwayNotice>;
