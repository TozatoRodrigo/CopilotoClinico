/**
 * Conteúdo do roteiro de cuidados paliativos (CC-329), extraído do PaliaPath
 * do ANY App v4: o `paliaData.ts` e os textos que moravam no JSX da tela.
 * Doses, critérios e textos clínicos são os do ANY; o porte só corrigiu
 * ortografia evidente e trocou ordem por sugestão ("considerar" → "considere").
 * Cada troca está declarada no teste diferencial
 * (tests/clinical-tools/palliative-differential.spec.ts) e listada na revisão
 * clínica (docs/ferramentas/revisao-clinica/paliativos.md).
 *
 * TypeScript puro: roda no navegador, no service worker e na API.
 */

/**
 * Peso de um destaque. O motor não conhece cor (ADR-017): a tela escolhe o
 * tom. `nota` é o `success` do ANY (verde, que no Copiloto vira nota neutra),
 * `informacao` o `info`, `atencao` o `warning` e `risco` o `danger`.
 */
export type NoteKind = 'nota' | 'informacao' | 'atencao' | 'risco';

export interface ClinicalNote {
  kind: NoteKind;
  /** Rótulo em negrito no início do destaque ("Quando usar"). */
  title: string;
  text: string;
}

export interface TitledText {
  title: string;
  description: string;
}

export const PALLIATIVE_SCREENS = [
  'inicio',
  'identificar',
  'decidir',
  'comunicar',
  'manejar',
  'ferramentas',
  'mitos',
  'referencias',
] as const;

export type PalliativeScreen = (typeof PALLIATIVE_SCREENS)[number];

export type PalliativeModuleId = Exclude<PalliativeScreen, 'inicio'>;

export interface PalliativeModule {
  id: PalliativeModuleId;
  title: string;
  subtitle: string;
}

export const PALLIATIVE_INTRO =
  'Ferramentas de apoio à decisão para identificação, comunicação e manejo de pacientes com necessidades paliativas.';

/** Os quatro passos do roteiro, na ordem da tela inicial do ANY. */
export const PALLIATIVE_STEPS: readonly PalliativeModule[] = [
  { id: 'identificar', title: 'Identificar', subtitle: 'SPICT-BR' },
  { id: 'decidir', title: 'Decidir', subtitle: 'SAVED' },
  { id: 'comunicar', title: 'Comunicar', subtitle: 'REDMAP / NURSE' },
  { id: 'manejar', title: 'Manejar', subtitle: 'Sintomas' },
];

/** Os extras da tela inicial. */
export const PALLIATIVE_EXTRAS: readonly PalliativeModule[] = [
  {
    id: 'ferramentas',
    title: 'Ferramentas e escalas',
    subtitle: 'ECOG, PPS, PPI, Conversão de Opioides, Hipodermóclise',
  },
  { id: 'mitos', title: 'Mitos e verdades', subtitle: '24 conceitos importantes desmistificados' },
  { id: 'referencias', title: 'Referências', subtitle: 'Fontes e literatura consultada' },
];

export const PALLIATIVE_MODULES: readonly PalliativeModule[] = [
  ...PALLIATIVE_STEPS,
  ...PALLIATIVE_EXTRAS,
];

// ---------------------------------------------------------------------------
// Identificar — SPICT-BR
// ---------------------------------------------------------------------------

export const SPICT_SUBTITLE = 'SPICT-BR — Ferramenta de Triagem para Cuidados Paliativos';

export const SPICT_WHEN_TO_USE: ClinicalNote = {
  kind: 'nota',
  title: 'Quando usar',
  text: 'Pacientes com doenças crônicas avançadas ou deterioração clínica progressiva. Se 2 ou mais indicadores positivos, considere abordagem paliativa.',
};

export interface SpictCategory {
  id: string;
  title: string;
  items: readonly string[];
}

export const SPICT_GENERAL_INDICATORS: SpictCategory = {
  id: 'gerais',
  title: 'Indicadores gerais de deterioração',
  items: [
    'Internações não planejadas',
    'Performance status ruim ou em declínio (restrito ao leito >50% do dia)',
    'Dependência crescente para AVDs',
    'Perda de peso significativa nos últimos 3-6 meses',
    'Sintomas persistentes apesar de tratamento otimizado',
    'Paciente ou família perguntam sobre cuidados paliativos ou prognóstico',
    'Paciente escolhe reduzir ou suspender tratamento',
  ],
};

export const SPICT_CATEGORIES: readonly SpictCategory[] = [
  {
    id: 'cardiaca',
    title: 'Doença cardíaca / vascular',
    items: [
      'ICC NYHA III/IV com sintomas persistentes',
      'Doença coronariana extensa não passível de intervenção',
      'Doença vascular periférica inoperável',
    ],
  },
  {
    id: 'respiratoria',
    title: 'Doença respiratória',
    items: [
      'Doença intersticial grave ou fibrose com declínio de função',
      'DPOC com dispneia em repouso ou aos mínimos esforços',
      'Oxigenoterapia domiciliar de longa duração',
      'Ventilação assistida',
    ],
  },
  {
    id: 'neurologica',
    title: 'Doença neurológica',
    items: [
      'Deterioração progressiva da função física/cognitiva',
      'Disfagia com aspiração recorrente',
      'Dificuldade de fala progressiva',
      'Pneumonias de repetição',
    ],
  },
  {
    id: 'renal',
    title: 'Doença renal',
    items: [
      'DRC estágio 4-5 (TFG <30) com deterioração',
      'Falha ou suspensão de diálise',
      'Opção por tratamento conservador',
    ],
  },
  {
    id: 'hepatica',
    title: 'Doença hepática',
    items: [
      'Cirrose avançada com complicações (ascite, encefalopatia, SHR)',
      'Transplante contraindicado',
    ],
  },
  {
    id: 'cancer',
    title: 'Câncer',
    items: [
      'Doença metastática ou localmente avançada',
      'Progressão durante tratamento oncológico',
      'Tratamento oncológico específico descontinuado',
    ],
  },
  {
    id: 'demencia',
    title: 'Demência / Fragilidade',
    items: [
      'Incapaz de vestir-se, tomar banho, alimentar-se sem ajuda',
      'Ingestão oral reduzida',
      'Incontinência urinária e fecal',
      'Incapaz de comunicação significativa',
      'Múltiplas comorbidades com declínio funcional',
      'Fragilidade com complicações ou declínio',
    ],
  },
];

export const SURPRISE_QUESTION = {
  title: 'Pergunta surpresa',
  question: '"Você ficaria surpreso se este paciente morresse nos próximos 12 meses?"',
  guidance: 'Se NÃO ficaria surpreso, considere cuidados paliativos.',
} as const;

// ---------------------------------------------------------------------------
// Decidir — SAVED
// ---------------------------------------------------------------------------

export const SAVED_SUBTITLE = 'SAVED — Framework para Decisão sobre Suporte de Vida';

export const SAVED_WHEN_TO_USE: ClinicalNote = {
  kind: 'informacao',
  title: 'Quando usar',
  text: 'Paciente crítico/instável com doença avançada para auxiliar na tomada de decisão sobre medidas de suporte vital.',
};

export interface CapacityCriterion {
  letter: string;
  title: string;
  description: string;
}

export interface SavedStep {
  letter: 'S' | 'A' | 'V' | 'E' | 'D';
  title: string;
  subtitle: string;
  /** Pergunta ou chamada em destaque ao abrir o passo. */
  prompt: string;
  items?: readonly string[];
  note?: string;
  capacity?: readonly CapacityCriterion[];
  /** "Importante:" em destaque de atenção. */
  important?: string;
  /** O que fazer se o paciente for incapaz (a tela põe o rótulo "Se incapaz:"). */
  ifIncapable?: string;
}

export const SAVED_STEPS: readonly SavedStep[] = [
  {
    letter: 'S',
    title: 'Surpresa',
    subtitle: 'Pergunta surpresa: expectativa de vida',
    prompt:
      'Pergunta: "Você ficaria surpreso se este paciente morresse nos próximos 12 meses (ou nesta internação)?"',
    note: 'Se NÃO ficaria surpreso, o paciente pode se beneficiar de abordagem paliativa precoce.',
  },
  {
    letter: 'A',
    title: 'Auxílio ao Paciente',
    subtitle: 'O que o paciente realmente quer?',
    prompt: 'Perguntas-chave:',
    items: [
      '"O que é mais importante para você agora?"',
      '"Se você não pudesse falar por si mesmo, quem falaria?"',
      '"Já conversou com sua família sobre suas preferências?"',
      'Há diretivas antecipadas documentadas?',
    ],
  },
  {
    letter: 'V',
    title: 'Valores e Vida',
    subtitle: 'Qualidade vs quantidade de vida',
    prompt: 'Explorar:',
    items: [
      'O que dá sentido à vida do paciente?',
      'O que seria inaceitável como qualidade de vida?',
      'Até onde ir com tratamentos intensivos?',
      'Preferências sobre local de cuidado e morte',
    ],
  },
  {
    letter: 'E',
    title: 'Educar',
    subtitle: 'Informar sobre prognóstico e opções',
    prompt: 'Comunicar:',
    items: [
      'Prognóstico realista (sem falsa esperança)',
      'Opções de tratamento disponíveis',
      'Consequências de cada opção',
      'O que os cuidados paliativos podem oferecer',
    ],
    note: 'Use linguagem clara: "A doença está avançando" em vez de "Não há mais o que fazer".',
  },
  {
    letter: 'D',
    title: 'Decisão (Capacidade)',
    subtitle: 'Avaliar capacidade decisória',
    prompt: '4 Critérios da Capacidade (CCEC):',
    capacity: [
      { letter: 'C', title: 'Compreender', description: 'Repete informações com suas palavras' },
      { letter: 'C', title: 'Contextualizar', description: 'Aplica à sua realidade' },
      { letter: 'E', title: 'Embasar', description: 'Justifica logicamente' },
      { letter: 'C', title: 'Comunicar', description: 'Expressa a escolha' },
    ],
    important:
      'Decisão contrária à orientação médica NÃO significa incapacidade. Demência ou doença psiquiátrica NÃO = automaticamente incapaz.',
    // No ANY o dado já começava com "Se incapaz:" e a tela repetia o rótulo.
    ifIncapable:
      'Identificar representante legal (cônjuge -> filhos -> pais -> irmãos). O representante decide baseado nos VALORES DO PACIENTE, não nos próprios.',
  },
];

// ---------------------------------------------------------------------------
// Comunicar — REDMAP, NURSE e frases
// ---------------------------------------------------------------------------

export const COMMUNICATE_SUBTITLE =
  'Técnicas para conversas difíceis e comunicação de más notícias';

export const OPENING_PHRASE = {
  title: 'Frase de abertura',
  text: '"O que você gostaria de saber sobre sua condição?"',
} as const;

export const REDMAP_TITLE = 'REDMAP — Roteiro de Conversa';

export const REDMAP_STEPS: readonly TitledText[] = [
  {
    title: 'R — Reframe (Reenquadrar)',
    description: '"Parece que a situação mudou. Podemos conversar sobre isso?"',
  },
  {
    title: 'E — Expect (Expectativas)',
    description: '"O que você espera que aconteça daqui para frente?"',
  },
  {
    title: 'D — Demonstrate (Demonstrar empatia)',
    description: '"Eu gostaria que as coisas fossem diferentes também."',
  },
  { title: 'M — Map (Mapear valores)', description: '"O que é mais importante para você agora?"' },
  { title: 'A — Align (Alinhar)', description: '"Dado o que você me disse, eu recomendo..."' },
  {
    title: 'P — Plan (Planejar)',
    description: '"Vamos fazer um plano juntos para garantir que você receba o melhor cuidado."',
  },
];

export const NURSE_TITLE = 'NURSE — Resposta Empática';

export const NURSE_STEPS: readonly TitledText[] = [
  {
    title: 'N — Name (Nomear)',
    description: '"Parece que você está com medo/triste/preocupado."',
  },
  {
    title: 'U — Understand (Compreender)',
    description: '"Eu consigo entender por que você se sente assim."',
  },
  {
    title: 'R — Respect (Respeitar)',
    description: '"Você tem sido muito forte lidando com tudo isso."',
  },
  {
    title: 'S — Support (Apoiar)',
    description: '"Estarei aqui com você durante todo esse processo."',
  },
  { title: 'E — Explore (Explorar)', description: '"Conte-me mais sobre o que está pensando."' },
];

/** Títulos das seções da tela Comunicar. */
export const COMMUNICATE_HEADINGS = {
  phrases: 'Frases Úteis',
  use: 'Use',
  avoid: 'Evite',
  alerts: 'Situações de Alerta',
} as const;

export const PHRASES_TO_USE: readonly string[] = [
  '"A doença está avançando apesar dos tratamentos."',
  '"O corpo dele/dela está mostrando sinais de que está se aproximando do fim."',
  '"Vamos focar no conforto e na qualidade de vida."',
  '"Não vamos abandoná-lo. Estaremos cuidando dele até o final."',
];

export const PHRASES_TO_AVOID: readonly string[] = [
  '"Não há mais nada a fazer."',
  '"Vamos suspender os cuidados."',
  '"É só esperar."',
];

export const ALERT_SITUATIONS: readonly string[] = [
  'Família solicita "fazer tudo" — explore o significado',
  'Conflito familiar sobre decisões — reunião multiprofissional',
  'Paciente e família com expectativas irreais — reeducar gentilmente',
  'Recusa de informação — respeitar, mas documentar',
];

// ---------------------------------------------------------------------------
// Manejar — sintomas
// ---------------------------------------------------------------------------

export const SYMPTOMS_TITLE = 'Manejar Sintomas';
export const SYMPTOMS_SUBTITLE = 'Controle de sintomas em cuidados paliativos no DE';

export const SYMPTOM_TABS = [
  { id: 'dor', label: 'Dor' },
  { id: 'dispneia', label: 'Dispneia' },
  { id: 'nausea', label: 'Náusea' },
  { id: 'delirium', label: 'Delirium' },
  { id: 'sedacao', label: 'Sedação' },
  { id: 'fase-final', label: 'Fase final' },
] as const;

export type SymptomTab = (typeof SYMPTOM_TABS)[number]['id'];

/** Linha de uma tabela de medicação: nome, dose e, quando houver, a coluna extra. */
export interface MedicationRow {
  name: string;
  dose: string;
  detail?: string;
}

export interface MedicationColumns {
  name: string;
  dose: string;
  detail?: string;
}

export interface TimedSign {
  sign: string;
  time: string;
}

/** Bloco de conteúdo de uma aba; a tela desenha cada tipo do seu jeito. */
export type ContentBlock =
  | { kind: 'note'; note: ClinicalNote }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: readonly string[]; emphasis?: 'risco' }
  | { kind: 'medications'; columns: MedicationColumns; rows: readonly MedicationRow[] }
  /** Degrau da escada analgésica: abre e fecha, com o número do degrau. */
  | { kind: 'group'; title: string; badge: string; blocks: readonly ContentBlock[] }
  | { kind: 'signs'; rows: readonly TimedSign[]; caption: string };

const MEDICATION_DOSE: MedicationColumns = { name: 'Medicação', dose: 'Dose' };

export const SYMPTOM_PAGES: Record<SymptomTab, readonly ContentBlock[]> = {
  dor: [
    {
      kind: 'note',
      note: {
        kind: 'atencao',
        title: 'Princípio',
        text: 'Opioides são a base do tratamento da dor moderada a grave em cuidados paliativos. Não há dose máxima — titular até alívio ou efeitos adversos intoleráveis.',
      },
    },
    { kind: 'heading', text: 'Escada analgésica (OMS modificada)' },
    {
      kind: 'group',
      title: 'Dor Leve (1-3)',
      badge: '1',
      blocks: [
        {
          kind: 'medications',
          columns: MEDICATION_DOSE,
          rows: [
            { name: 'Dipirona', dose: '1g EV 6/6h' },
            { name: 'Paracetamol', dose: '750mg VO 6/6h' },
          ],
        },
      ],
    },
    {
      kind: 'group',
      title: 'Dor Moderada (4-6)',
      badge: '2',
      blocks: [
        {
          kind: 'medications',
          columns: MEDICATION_DOSE,
          rows: [
            { name: 'Tramadol', dose: '50-100mg EV/VO 6/6h' },
            { name: 'Codeína', dose: '30-60mg VO 4/4h' },
          ],
        },
        { kind: 'text', text: '+ Analgésico simples' },
      ],
    },
    {
      kind: 'group',
      title: 'Dor Intensa (7-10)',
      badge: '3',
      blocks: [
        {
          kind: 'medications',
          columns: { name: 'Medicação', dose: 'Dose Inicial' },
          rows: [
            { name: 'Morfina', dose: '2-5mg EV/SC (virgem) | 10-15% dose/24h (usuário)' },
            { name: 'Fentanil', dose: '25-50mcg EV lento' },
            { name: 'Metadona', dose: '2,5-5mg VO 8/8h' },
          ],
        },
        {
          kind: 'note',
          note: {
            kind: 'nota',
            title: 'Dose de resgate',
            text: '10-15% da dose total diária, a cada 1-2h se necessário.',
          },
        },
      ],
    },
  ],
  dispneia: [
    {
      kind: 'note',
      note: {
        kind: 'informacao',
        title: 'Lembrar',
        text: 'Dispneia é subjetiva. Tratar mesmo com SpO2 normal se paciente refere desconforto. Morfina é primeira linha.',
      },
    },
    { kind: 'heading', text: 'Tratamento Farmacológico' },
    {
      kind: 'medications',
      columns: { name: 'Medicação', dose: 'Dose', detail: 'Obs' },
      rows: [
        { name: 'Morfina', dose: '2-5mg SC/EV', detail: '1ª linha' },
        { name: 'Midazolam', dose: '2,5-5mg SC/EV', detail: 'Se ansiedade' },
        { name: 'Dexametasona', dose: '4-8mg EV', detail: 'Se obstrução/edema' },
      ],
    },
    {
      kind: 'note',
      note: {
        kind: 'atencao',
        title: 'Efeito teto',
        text: 'Morfina >20mg/24h geralmente não traz alívio adicional para dispneia. Considere midazolam associado.',
      },
    },
    { kind: 'heading', text: 'Medidas não farmacológicas' },
    {
      kind: 'list',
      items: [
        'Ventilador/fluxo de ar no rosto',
        'Posicionamento (cabeceira elevada)',
        'Ambiente calmo e ventilado',
        'Presença de familiar',
      ],
    },
  ],
  nausea: [
    {
      kind: 'note',
      note: {
        kind: 'nota',
        title: 'Avaliar causa',
        text: 'Constipação? Obstrução? Medicamentos? Hipertensão intracraniana? Metabólica?',
      },
    },
    { kind: 'heading', text: 'Tratamento por mecanismo' },
    {
      // No ANY a causa entrava no nome ("Geral / QT — Ondansetrona") e a
      // coluna "Obs" ficava vazia; aqui a causa tem coluna própria.
      kind: 'medications',
      columns: { name: 'Medicação', dose: 'Dose', detail: 'Causa' },
      rows: [
        { name: 'Ondansetrona', dose: '4-8mg EV 8/8h', detail: 'Geral / QT' },
        { name: 'Metoclopramida', dose: '10mg EV 8/8h', detail: 'Gastroparesia' },
        { name: 'Haloperidol', dose: '0,5-2mg EV/SC 8/8h', detail: 'Obstrução' },
        { name: 'Dexametasona', dose: '4-8mg EV 12/12h', detail: 'HIC' },
        { name: 'Dimenidrinato', dose: '50mg EV 6/6h', detail: 'Vestibular' },
      ],
    },
    {
      kind: 'note',
      note: {
        kind: 'atencao',
        title: 'Obstrução intestinal',
        text: 'Considere octreotide 100-300mcg SC 8/8h para reduzir secreções.',
      },
    },
  ],
  delirium: [
    {
      kind: 'note',
      note: {
        kind: 'risco',
        title: 'Investigar causas reversíveis',
        text: 'Dor, retenção urinária, constipação, infecção, medicamentos (opioides, BZD), distúrbios metabólicos, hipóxia.',
      },
    },
    { kind: 'heading', text: 'Tratamento Farmacológico' },
    {
      kind: 'medications',
      columns: { name: 'Medicação', dose: 'Dose', detail: 'Via' },
      rows: [
        { name: 'Haloperidol', dose: '0,5-2mg', detail: 'EV/SC/VO' },
        { name: 'Quetiapina', dose: '12,5-50mg', detail: 'VO' },
        { name: 'Risperidona', dose: '0,5-1mg', detail: 'VO' },
      ],
    },
    {
      kind: 'note',
      note: {
        kind: 'nota',
        title: 'Haloperidol',
        text: 'Considere iniciar 1mg SC/EV a cada 2h até controle, depois manter 6/6h ou 8/8h.',
      },
    },
    { kind: 'heading', text: 'Medidas não farmacológicas' },
    {
      kind: 'list',
      items: [
        'Reorientação frequente',
        'Ambiente calmo, iluminado',
        'Presença de familiar',
        'Evitar contenção física',
        'Ciclo sono-vigília preservado',
      ],
    },
  ],
  sedacao: [
    {
      kind: 'note',
      note: {
        kind: 'risco',
        title: 'Indicação',
        text: 'Sintoma refratário (não responde a tratamento convencional) em paciente com doença terminal, causando sofrimento intolerável.',
      },
    },
    { kind: 'heading', text: 'Pré-requisitos (CFM)' },
    {
      kind: 'list',
      emphasis: 'risco',
      items: [
        'Doença terminal documentada',
        'Sintoma(s) refratário(s) a tratamentos convencionais',
        'Consentimento do paciente ou representante',
        'Discussão em equipe multiprofissional',
        'Documentação completa em prontuário',
      ],
    },
    { kind: 'heading', text: 'Protocolo (Midazolam)' },
    {
      kind: 'medications',
      columns: { name: 'Etapa', dose: 'Dose' },
      rows: [
        { name: 'Bolus inicial', dose: '2,5-5mg EV/SC' },
        { name: 'Manutenção', dose: '0,5-1mg/h BIC' },
        { name: 'Titulação', dose: 'Aumentar 0,5mg/h a cada 30min' },
      ],
    },
    {
      kind: 'note',
      note: {
        kind: 'atencao',
        title: 'Alvo RASS',
        text: '-3 a -4 (sedação moderada a profunda). Reavaliar a cada 4h. Manter via SC se EV indisponível.',
      },
    },
    { kind: 'heading', text: 'Alternativas' },
    {
      kind: 'medications',
      columns: MEDICATION_DOSE,
      rows: [
        { name: 'Propofol', dose: '0,5-1mg/kg/h (UTI)' },
        { name: 'Fenobarbital', dose: '100-200mg SC 12/12h' },
      ],
    },
  ],
  'fase-final': [
    {
      kind: 'note',
      note: {
        kind: 'nota',
        title: 'Definição',
        text: 'Paciente cuja morte é inevitável em curto período (dias a semanas), a despeito de todo cuidado médico.',
      },
    },
    { kind: 'heading', text: 'Sinais de Morte Iminente' },
    {
      kind: 'signs',
      rows: [
        { sign: 'Secreção respiratória (sororoca)', time: '~23h' },
        { sign: 'Respiração mandibular', time: '~2,5h' },
        { sign: 'Cianose de extremidades', time: '~1h' },
        { sign: 'Ausência de pulso radial', time: '~1h' },
      ],
      caption: 'Tempo médio até óbito (mediana)',
    },
    { kind: 'heading', text: 'Cuidados não farmacológicos' },
    {
      kind: 'list',
      items: [
        'Reduzir frequência de aferição de sinais vitais',
        'Mudança de decúbito suave (usar coxins)',
        'Suspender dieta quando RNC (comunicar família antes)',
        'Secreção oral: posicionar cabeça, NÃO aspirar',
        'Hidratação labial com gaze umidificada',
        'Permitir presença de familiar',
      ],
    },
    { kind: 'heading', text: 'Desprescrição' },
    {
      kind: 'note',
      note: {
        kind: 'nota',
        title: 'Considere suspender',
        text: 'Estatinas, AAS, hipoglicemiantes, insulina, anti-hipertensivos (avaliar), medicações preventivas.',
      },
    },
    {
      kind: 'note',
      note: {
        kind: 'risco',
        title: 'Considere manter',
        text: 'Analgésicos, antieméticos, antissecretivos, anticonvulsivantes. Cuidado: Betabloqueadores e clonidina — reduzir gradualmente (risco de rebote).',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Mitos e verdades
// ---------------------------------------------------------------------------

export const MYTH_CATEGORIES = [
  { id: 'conceito', label: 'Sobre o Conceito' },
  { id: 'medicacoes', label: 'Sobre Medicações' },
  { id: 'comunicacao', label: 'Sobre Comunicação' },
  { id: 'prognostico', label: 'Sobre Prognóstico' },
] as const;

export type MythCategory = (typeof MYTH_CATEGORIES)[number]['id'];

export interface Myth {
  id: number;
  category: MythCategory;
  title: string;
  /** `false` só no "Milagre acontece", o único que o ANY marca como verdade. */
  isMyth: boolean;
  statement: string;
  explanation: string;
}

export const MYTHS: readonly Myth[] = [
  {
    id: 1,
    category: 'conceito',
    title: '"Não há o que fazer"',
    isMyth: true,
    statement: '"Cuidados paliativos significa que não há mais nada a fazer."',
    explanation:
      'Cuidados paliativos são uma abordagem ATIVA que visa melhorar a qualidade de vida. Há MUITO a fazer: controle impecável de sintomas, suporte emocional, planejamento de cuidados, apoio à família, dignidade no processo de morrer.',
  },
  {
    id: 2,
    category: 'conceito',
    title: '"Tudo ou nada"',
    isMyth: true,
    statement: '"Ou fazemos tudo para curar, ou não fazemos nada."',
    explanation:
      'Existe um amplo espectro entre "investir em tudo" e "não fazer nada". Cuidados paliativos podem ser integrados com tratamentos curativos desde o diagnóstico. O objetivo é proporcionalidade e adequação ao momento do paciente.',
  },
  {
    id: 3,
    category: 'conceito',
    title: '"Só para câncer"',
    isMyth: true,
    statement: '"Cuidados paliativos são apenas para pacientes oncológicos."',
    explanation:
      'Cuidados paliativos beneficiam qualquer doença grave e ameaçadora à vida: ICC, DPOC, DRC, demência, doenças neurológicas, fragilidade do idoso. Todas essas condições cursam com sintomas que precisam de manejo adequado.',
  },
  {
    id: 4,
    category: 'conceito',
    title: '"Só no fim"',
    isMyth: true,
    statement: '"Cuidados paliativos devem ser iniciados apenas nos últimos dias de vida."',
    explanation:
      'Quanto mais precoce a integração dos cuidados paliativos, melhores os desfechos. Estudos mostram que pacientes com câncer de pulmão que receberam CP precoces viveram MAIS e com melhor qualidade de vida.',
  },
  {
    id: 5,
    category: 'conceito',
    title: '"Não no DE"',
    isMyth: true,
    statement: '"Cuidados paliativos não são papel do emergencista."',
    explanation:
      'O DE é frequentemente o primeiro ponto de contato com pacientes em crise de doença avançada. Emergencistas estão em posição privilegiada para identificar, iniciar conversas e aliviar sofrimento agudo.',
  },
  {
    id: 6,
    category: 'conceito',
    title: '"É desistir"',
    isMyth: true,
    statement: '"Oferecer cuidados paliativos é o mesmo que desistir do paciente."',
    explanation:
      'Cuidados paliativos são uma mudança de FOCO, não de intensidade. O objetivo passa a ser qualidade de vida e conforto. É uma das formas mais intensas de cuidado que podemos oferecer.',
  },
  {
    id: 7,
    category: 'medicacoes',
    title: '"Morfina vicia"',
    isMyth: true,
    statement: '"Morfina causa dependência em pacientes com dor."',
    explanation:
      'Dependência física (tolerância) é diferente de adicção (transtorno de uso). Pacientes com dor que recebem opioides raramente desenvolvem adicção. O subtratamento da dor é muito mais comum e prejudicial.',
  },
  {
    id: 8,
    category: 'medicacoes',
    title: '"Morfina mata"',
    isMyth: true,
    statement: '"Morfina acelera a morte do paciente."',
    explanation:
      'Quando titulada adequadamente para controle de sintomas, morfina NÃO encurta a vida. Estudos mostram que pacientes com bom controle de dor e dispneia frequentemente vivem mais. O duplo efeito é eticamente aceito.',
  },
  {
    id: 9,
    category: 'medicacoes',
    title: '"Sedação é eutanásia"',
    isMyth: true,
    statement: '"Sedação paliativa é uma forma disfarçada de eutanásia."',
    explanation:
      'Sedação paliativa visa controlar sintomas refratários, não antecipar a morte. A intenção (alívio de sofrimento) e o método (titulação para conforto) são completamente diferentes da eutanásia.',
  },
  {
    id: 10,
    category: 'medicacoes',
    title: '"Dose máxima"',
    isMyth: true,
    statement: '"Opioides têm dose máxima que não pode ser ultrapassada."',
    explanation:
      'Opioides NÃO têm dose teto para analgesia. A dose correta é aquela que alivia a dor com efeitos adversos toleráveis. Pacientes em uso crônico desenvolvem tolerância e podem precisar de doses muito altas.',
  },
  {
    id: 11,
    category: 'medicacoes',
    title: '"Guardar para depois"',
    isMyth: true,
    statement: '"Melhor guardar os opioides fortes para quando a dor piorar."',
    explanation:
      'Dor não controlada causa sofrimento desnecessário e pode levar a sensibilização central, tornando o controle futuro mais difícil. Usar a medicação adequada ao nível de dor AGORA é o correto.',
  },
  {
    id: 12,
    category: 'medicacoes',
    title: '"Só se pedir"',
    isMyth: true,
    statement: '"Só devo dar analgésico se o paciente pedir."',
    explanation:
      'Muitos pacientes, especialmente idosos e com déficit cognitivo, não pedem analgesia mesmo com dor intensa. A avaliação proativa e sistemática da dor é responsabilidade da equipe.',
  },
  {
    id: 13,
    category: 'comunicacao',
    title: '"Tira esperança"',
    isMyth: true,
    statement: '"Falar sobre cuidados paliativos tira a esperança do paciente."',
    explanation:
      'Honestidade compassiva não elimina esperança — redireciona. Pacientes podem manter esperança de conforto, tempo de qualidade, resolução de pendências. Falsas esperanças causam mais dano.',
  },
  {
    id: 14,
    category: 'comunicacao',
    title: '"Família decide"',
    isMyth: true,
    statement: '"A família é quem deve decidir sobre os cuidados do paciente."',
    explanation:
      'O paciente capaz é o protagonista de suas decisões. A família representa os desejos do paciente quando ele não pode se expressar, mas deve basear-se nos valores DELE, não nos próprios.',
  },
  {
    id: 15,
    category: 'comunicacao',
    title: '"Não falar em morte"',
    isMyth: true,
    statement: '"Não devemos mencionar a possibilidade de morte para o paciente."',
    explanation:
      'Maioria dos pacientes quer informação honesta sobre seu prognóstico. Evitar o tema impede planejamento, despedidas e fechamento de ciclos. A comunicação deve ser gradual, respeitosa e individualizada.',
  },
  {
    id: 16,
    category: 'comunicacao',
    title: '"Paciente não quer saber"',
    isMyth: true,
    statement: '"A maioria dos pacientes não quer saber sobre seu prognóstico."',
    explanation:
      'Estudos mostram que 70-90% dos pacientes desejam informação sobre seu prognóstico. A percepção de que "não querem saber" frequentemente é projeção da nossa própria dificuldade em comunicar.',
  },
  {
    id: 17,
    category: 'comunicacao',
    title: '"Conversa leva tempo"',
    isMyth: true,
    statement: '"Não tenho tempo no DE para ter conversas sobre fim de vida."',
    explanation:
      'Conversas efetivas sobre metas de cuidado podem ser breves (5-10 minutos). Perguntas-chave bem colocadas economizam tempo e evitam procedimentos desnecessários. É questão de técnica, não de tempo.',
  },
  {
    id: 18,
    category: 'comunicacao',
    title: '"Depois da UTI"',
    isMyth: true,
    statement: '"Cuidados paliativos devem começar após alta da UTI."',
    explanation:
      'A UTI é um dos locais onde mais se precisa de cuidados paliativos. Pacientes gravemente enfermos beneficiam-se de controle de sintomas, comunicação estruturada e planejamento de cuidados durante a internação.',
  },
  {
    id: 19,
    category: 'prognostico',
    title: '"Paciente jovem"',
    isMyth: true,
    statement: '"Paciente jovem sempre deve receber medidas invasivas."',
    explanation:
      'Idade não é critério para proporcionalidade de tratamento. Pacientes jovens com doenças terminais também têm direito a cuidados paliativos e a recusar medidas invasivas que não mudam prognóstico.',
  },
  {
    id: 20,
    category: 'prognostico',
    title: '"Ainda tem opção"',
    isMyth: true,
    statement: '"Se ainda existe alguma opção de tratamento, não é hora de paliativos."',
    explanation:
      'Cuidados paliativos e tratamento curativo não são mutuamente exclusivos. A integração precoce melhora qualidade de vida e, em alguns estudos, até sobrevida. Não precisa esperar "não ter mais nada".',
  },
  {
    id: 21,
    category: 'prognostico',
    title: '"Prognóstico exato"',
    isMyth: true,
    statement: '"Médicos conseguem prever com precisão quanto tempo o paciente tem."',
    explanation:
      'Prognóstico é probabilístico, não determinístico. Médicos tendem a superestimar sobrevida. Ferramentas como PPI ajudam, mas devem ser comunicadas como estimativas, não certezas.',
  },
  {
    id: 22,
    category: 'prognostico',
    title: '"Milagre acontece"',
    isMyth: false,
    statement: '"Casos excepcionais de recuperação inesperada existem."',
    explanation:
      'Verdade! Casos excepcionais ocorrem, mas são estatisticamente raros. Basear decisões em exceções extremas pode prolongar sofrimento desnecessariamente para a grande maioria. Equilíbrio é fundamental.',
  },
  {
    id: 23,
    category: 'prognostico',
    title: '"Só oncologia decide"',
    isMyth: true,
    statement: '"Apenas o oncologista pode indicar cuidados paliativos."',
    explanation:
      'Qualquer médico pode identificar necessidade de cuidados paliativos e iniciar abordagem. O emergencista frequentemente é o primeiro a reconhecer e pode coordenar com equipe especializada posteriormente.',
  },
  {
    id: 24,
    category: 'prognostico',
    title: '"Se entrar no DE, intubo"',
    isMyth: true,
    statement: '"Se o paciente veio ao DE, é porque quer ser intubado e reanimado."',
    explanation:
      'Pacientes vêm ao DE por diversos motivos: dor, dispneia, medo, orientação inadequada. Vir ao DE não significa automaticamente querer medidas invasivas. Sempre verificar desejos e contexto.',
  },
];

// ---------------------------------------------------------------------------
// Referências
// ---------------------------------------------------------------------------

export interface ReferenceGroup {
  title: string;
  items: readonly string[];
}

export const PALLIATIVE_REFERENCES: readonly ReferenceGroup[] = [
  {
    title: 'Ferramentas e Escalas',
    items: [
      'SPICT-BR. NHS Lothian / University of Edinburgh, 2019.',
      'Morita T, et al. The Palliative Prognostic Index. Support Care Cancer. 1999;7:128-133.',
      'Anderson F, et al. Palliative Performance Scale (PPS). J Palliat Care. 1996.',
      'Oken MM, et al. ECOG Performance Status. Am J Clin Oncol. 1982.',
    ],
  },
  {
    title: 'Manejo de Sintomas',
    items: [
      'UpToDate: Palliative care in the emergency department, 2024.',
      'UpToDate: Overview of managing common symptoms in palliative care, 2024.',
      'Protocolo de Sedação Paliativa — ANCP, 2023.',
      'Cuidados Paliativos na Emergência — USP, 2021.',
    ],
  },
  {
    title: 'Comunicação',
    items: [
      'VitalTalk. Communication Skills Training for Clinicians.',
      'Ribeiro VZ, et al. SAVED Framework. J Bras Med Emerg. 2024.',
      'Back AL, et al. Approaching difficult communication tasks in oncology. CA Cancer J Clin. 2005.',
    ],
  },
  {
    title: 'Ética e Legislação',
    items: [
      'Resolução CFM n. 1.805/2006 — Ortotanásia.',
      'Resolução CFM n. 1.995/2012 — Diretivas Antecipadas de Vontade.',
      'Resolução CFM n. 2.217/2018 — Código de Ética Médica.',
    ],
  },
];
