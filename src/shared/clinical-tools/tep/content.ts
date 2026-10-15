import type { TepLink } from './links';
import type { TepAnswer, TepQuestionId } from './pathway';

/**
 * Textos do roteiro do TEP (CC-318), do `TepGuide.tsx` do ANY: perguntas,
 * opções, alertas e doses de cada passo. A tela só desenha; nenhuma dose ou
 * limiar mora em componente (ADR-017). Mudanças em relação ao ANY: acentuação,
 * "threshold" → "ponto de corte", "ug" → "µg" e imperativos trocados por
 * sugestão; tests/clinical-tools/tep-differential.spec.ts lista cada troca.
 */

/** Classe de recomendação que o ANY mostra ao lado do texto ("COR 2a"). */
export type RecommendationClass = '1' | '2a' | '2b' | '3' | '3: Dano';

/**
 * Tom de um aviso do roteiro. Os `AlertCard` do ANY: perigo → crítico,
 * atenção → atenção, informação → informativo, sucesso → neutro (verde no
 * Copiloto é conduta confirmada; ADR-017).
 */
export type TepNoticeTone = 'neutral' | 'attention' | 'critical' | 'info';

export interface TepNotice {
  tone: TepNoticeTone;
  title?: string;
  text?: string;
  cor?: RecommendationClass;
  links?: readonly TepLink[];
}

export interface TepOption<Value extends string> {
  value: Value;
  label: string;
}

/** Bloco de droga ou conduta: nome em destaque e o texto ao lado. */
export interface TepDrugBlock {
  name: string;
  text: string;
  link?: TepLink;
}

export const STABILITY = {
  title: 'Estabilidade hemodinâmica',
  description: 'Avaliação inicial do paciente com suspeita de TEP agudo.',
  stable: 'Paciente hemodinamicamente estável',
  unstable: 'Instabilidade hemodinâmica (PAS < 90, choque, PCR)',
} as const;

const HEPARIN_LINK: TepLink = {
  kind: 'infusao',
  drug: 'heparina',
  label: 'Calculadora de heparina',
};

/** Pós-trombólise, igual nas duas doses. */
const AFTER_THROMBOLYSIS: TepDrugBlock = {
  name: 'Pós-trombólise',
  text: 'Suspender HNF durante infusão. Reiniciar sem bolus quando TTPa < 2× o controle.',
};

export const UNSTABLE = {
  label: 'Paciente instável',
  title: 'Protocolo de instabilidade hemodinâmica',
  priority: {
    tone: 'critical',
    title: 'Prioridade',
    text: 'Reanimação hemodinâmica antes de diagnóstico. Considere iniciar o suporte sem demora.',
  } satisfies TepNotice,
  immediateActions: {
    title: 'Ações imediatas',
    items: [
      'Acesso venoso calibroso (2 acessos periféricos ou central)',
      'Monitorização contínua (ECG, SpO₂, PA invasiva se possível)',
      'Gasometria arterial + lactato',
      'Troponina, BNP/NT-proBNP',
      'Hemograma, coagulograma, creatinina',
      'Tipagem sanguínea + reserva de hemoderivados',
      'Beta-hCG (mulheres em idade fértil)',
    ],
  },
  echo: {
    title: 'Eco à beira-leito — disfunção de VD',
    text: 'O eco pode definir a conduta antes da CTPA no paciente instável.',
    record: 'Registrar achados do eco',
    reference: {
      kind: 'referencia',
      section: 'eco',
      label: 'Ver referência completa de eco',
    } satisfies TepLink,
  },
  support: {
    title: 'Suporte hemodinâmico',
    blocks: [
      {
        name: 'Norepinefrina',
        text: 'Vasopressor de 1ª escolha. Acima de 15 mcg/min, considere segundo agente.',
        link: { kind: 'infusao', drug: 'noradrenalina', label: 'Calculadora de noradrenalina' },
      },
      {
        name: 'Volume com cautela',
        text: 'VD sobrecarregado não tolera expansão volêmica excessiva. Considere 250 mL em bolus e reavalie.',
      },
      {
        name: 'Dobutamina',
        text: 'Considere se baixo débito persistente apesar de vasopressores (até 10 mcg/kg/min).',
        link: { kind: 'infusao', drug: 'dobutamina', label: 'Calculadora de dobutamina' },
      },
    ] satisfies readonly TepDrugBlock[],
  },
  intubation: {
    tone: 'critical',
    title: 'Sedação e IOT',
    text: 'Podem causar colapso hemodinâmico catastrófico em disfunção de VD. Sedativos reduzem mecanismos compensatórios (taquicardia, aumento de RVS). Evitar salvo indicação forte. CNAF antes de IOT quando possível. Equipe preparada com vasopressores.',
    links: [
      { kind: 'ferramenta', toolId: 'via-aerea', label: 'Intubação e via aérea' },
      { kind: 'ferramenta', toolId: 'sedacao', label: 'Sedação' },
    ],
  } satisfies TepNotice,
  anticoagulation: {
    title: 'Anticoagulação empírica',
    text: 'Se alta suspeita clínica + disfunção de VD ao eco → considere anticoagulação antes da confirmação por CTPA.',
    heparin: {
      name: 'HNF',
      text: 'Bolus 80 UI/kg IV + infusão 18 UI/kg/h. Preferida no instável pela meia-vida curta e reversibilidade.',
      link: HEPARIN_LINK,
    } satisfies TepDrugBlock,
    contraindications: {
      kind: 'referencia',
      section: 'contraindicacoes',
      label: 'Verificar contraindicações antes',
    } satisfies TepLink,
  },
  thrombolysis: {
    title: 'Trombólise sistêmica',
    text: 'Em pacientes com hipotensão persistente ou choque e alta suspeita de TEP, trombólise sistêmica pode ser considerada mesmo sem confirmação por CTPA.',
    contraindication: {
      question: 'O paciente tem contraindicação absoluta?',
      detail:
        'AVC hemorrágico, cirurgia SNC < 3 semanas, sangramento ativo não compressível, lesão estrutural SNC',
      yes: 'Sim — contraindicada',
      no: 'Não',
    },
    contraindicated: {
      tone: 'critical',
      title: 'Trombólise contraindicada.',
      text: 'Considere alternativas: CDL (cateter-direcionada), trombectomia cirúrgica, ou ECMO.',
    } satisfies TepNotice,
    bleedingRisk: {
      question: 'Há risco hemorrágico elevado?',
      detail:
        'Idade > 75 anos, peso < 60 kg, cirurgia recente (< 10 dias), uso de anticoagulante, plaquetas < 100.000',
      yes: 'Sim — risco alto',
      no: 'Não — risco padrão',
    },
    reducedDose: {
      notice: { tone: 'attention', title: 'Dose reduzida recomendada' } satisfies TepNotice,
      blocks: [
        {
          name: 'Alteplase 50 mg IV em 2 h',
          text: 'Considere em: peso < 60 kg, idade > 75 anos, risco hemorrágico elevado. Dados de MOPETT trial suportam eficácia com menor risco de sangramento.',
        },
        AFTER_THROMBOLYSIS,
      ] satisfies readonly TepDrugBlock[],
    },
    standardDose: {
      notice: { tone: 'neutral', title: 'Dose padrão' } satisfies TepNotice,
      blocks: [
        {
          name: 'Alteplase 100 mg IV em 2 h',
          text: 'Regime padrão: 10 mg em bolus + 90 mg em 2 h. Se PCR: 50 mg em bolus (pode repetir em 15 min se necessário).',
        },
        AFTER_THROMBOLYSIS,
      ] satisfies readonly TepDrugBlock[],
    },
    reassess: 'Reavaliar',
    contraindications: {
      kind: 'referencia',
      section: 'contraindicacoes',
      label: 'Ver lista completa de contraindicações',
    } satisfies TepLink,
  },
  confirmation: {
    tone: 'info',
    title: 'Confirmação diagnóstica',
    text: 'Considere CTPA quando estabilizado. Se indisponível ou instabilidade refratária, considere tratamento empírico baseado em eco + clínica.',
  } satisfies TepNotice,
  classify: {
    title: 'Classificar gravidade',
    options: [
      { value: 'E2', label: 'Choque refratário / PCR → categoria E2' },
      { value: 'E1', label: 'Hipotensão persistente → categoria E1' },
      { value: 'D', label: 'Hipotensão transitória / sinais de hipoperfusão → categoria D' },
    ] satisfies readonly TepOption<'E2' | 'E1' | 'D'>[],
  },
} as const;

const IMAGING_DELAY_TITLE = 'Imagem indisponível ou com atraso significativo?';

export const DIAGNOSIS = {
  title: 'Investigação diagnóstica',
  anticoagulated: {
    tone: 'attention',
    title: 'Paciente já anticoagulado?',
    text: 'D-dímero e algoritmo YEARS não foram validados em pacientes em anticoagulação terapêutica. Considere imagem direto se suspeita clínica relevante.',
  } satisfies TepNotice,
  pregnancy: {
    notPregnant: 'Não gestante (Wells)',
    pregnant: 'Gestante (YEARS)',
  },
  wells: {
    question: 'Probabilidade pré-teste (Wells)',
    options: [
      { value: 'baixa', label: 'Baixa (< 2)' },
      { value: 'intermediaria', label: 'Intermediária (2–6)' },
      { value: 'alta', label: 'Alta (> 6)' },
    ] satisfies readonly TepOption<'baixa' | 'intermediaria' | 'alta'>[],
    calculate: 'Calcular Wells',
  },
  low: {
    notice: { tone: 'neutral', title: 'Wells < 2 — baixa probabilidade.' } satisfies TepNotice,
    percQuestion: 'PERC (se gestalt < 15%):',
    percOptions: [
      { value: 'negativo', label: 'PERC negativo' },
      { value: 'positivo', label: 'PERC positivo' },
    ] satisfies readonly TepOption<'negativo' | 'positivo'>[],
    calculate: 'Calcular PERC',
    calculateHint:
      'Todos os 8 critérios devem ser negativos + gestalt < 15% para considerar TEP improvável.',
    percNegative: {
      tone: 'neutral',
      text: 'TEP improvável — considere diagnósticos alternativos. Considere documentar: PERC negativo + gestalt < 15%.',
    } satisfies TepNotice,
    percPositive: {
      tone: 'attention',
      text: 'PERC positivo — considere D-dímero (abaixo).',
    } satisfies TepNotice,
  },
  moderate: {
    notice: {
      tone: 'attention',
      title: 'Wells 2–6 — probabilidade intermediária.',
    } satisfies TepNotice,
  },
  dDimer: {
    question: 'Resultado do D-dímero:',
    options: [
      { value: 'negativo', label: 'Negativo (abaixo do ponto de corte)' },
      { value: 'positivo', label: 'Positivo (acima do ponto de corte)' },
    ] satisfies readonly TepOption<'negativo' | 'positivo'>[],
    calculateAge: 'Calcular D-dímero ajustado por idade',
    calculateAgeHint: 'Ponto de corte = idade × 10 µg/L (FEU). Abaixo de 50 anos: usar 500 µg/L.',
    calculateYears: 'Calcular YEARS',
    calculateYearsHint:
      '≥ 1 critério YEARS: ponto de corte 500 µg/L. Nenhum critério: ponto de corte 1000 µg/L.',
    negative: {
      tone: 'neutral',
      text: 'D-dímero negativo — TEP improvável. Considere diagnósticos alternativos. Se gestalt clínica elevada, considere imagem direta.',
    } satisfies TepNotice,
    positive: {
      tone: 'info',
      title: 'D-dímero positivo — imagem recomendada.',
      text: 'CTPA (preferida) ou V/Q se contraindicação a contraste.',
    } satisfies TepNotice,
    imagingDelay: {
      tone: 'attention',
      title: IMAGING_DELAY_TITLE,
      text: 'Considere anticoagulação empírica se alta suspeita clínica e baixo risco de sangramento.',
      cor: '2a',
    } satisfies TepNotice,
  },
  high: {
    notices: [
      {
        tone: 'critical',
        title: 'Wells > 6 — alta probabilidade.',
        text: 'Imagem recomendada sem necessidade de D-dímero.',
      },
      { tone: 'info', text: 'CTPA (preferida) ou V/Q se contraindicação a contraste iodado.' },
      {
        tone: 'attention',
        title: IMAGING_DELAY_TITLE,
        text: 'Considere anticoagulação empírica se baixo risco de sangramento.',
        cor: '2a',
      },
    ] satisfies readonly TepNotice[],
  },
  pregnant: {
    notice: {
      tone: 'info',
      title: 'Gestante',
      text: 'Considere YEARS adaptado para gestação (COR 2b). USG de MMII se sintomas — se positivo, considere tratar sem CTPA.',
    } satisfies TepNotice,
    question: 'Resultado YEARS gestante:',
    options: [
      { value: 'negativo', label: 'TEP improvável' },
      { value: 'positivo', label: 'Imagem necessária' },
    ] satisfies readonly TepOption<'negativo' | 'positivo'>[],
    calculate: 'Calcular YEARS gestantes',
    calculateHint: '≥ 1 critério: ponto de corte 500 µg/L. Nenhum: ponto de corte 1000 µg/L.',
    ultrasound:
      'Se sintomas em MMII + USG compressão positiva → pode tratar com anticoagulação sem necessidade de CTPA.',
    negative: {
      tone: 'neutral',
      text: 'YEARS gestante negativo — TEP improvável. Considere diagnósticos alternativos.',
    } satisfies TepNotice,
    positive: {
      tone: 'info',
      title: 'Imagem necessária.',
      text: 'CTPA ou V/Q. Se sintomas em MMII, considere USG antes.',
    } satisfies TepNotice,
  },
  confirm: 'TEP confirmado → classificar',
} as const;

export const CLASSIFICATION = {
  title: 'Classificação AHA/ACC',
  description: 'Responda as perguntas para determinar a categoria clínica.',
  questions: {
    sintomas: {
      title: 'O paciente é sintomático?',
      options: [
        { value: 'assintomatico', label: 'Não — TEP incidental / assintomático' },
        { value: 'sintomatico', label: 'Sim — dispneia, dor torácica, síncope, hemoptise, etc.' },
      ],
    },
    spesi: {
      title: 'sPESI — estratificação de risco',
      options: [
        { value: 'baixo-risco', label: 'sPESI = 0 (baixo risco)' },
        { value: 'risco-elevado', label: 'sPESI ≥ 1 (risco elevado)' },
      ],
    },
    hestia: {
      title: 'Hestia — elegibilidade para tratamento ambulatorial',
      options: [
        { value: 'hestia-negativo', label: 'Hestia negativo (ambulatorial)' },
        { value: 'hestia-positivo', label: 'Hestia positivo (internação)' },
      ],
    },
    localizacao: {
      title: 'Localização do trombo',
      options: [
        { value: 'subsegmentar', label: 'Subsegmentar isolado' },
        { value: 'segmentar', label: 'Segmentar ou mais proximal' },
      ],
    },
    biomarcadores: {
      title: 'Biomarcadores e disfunção de VD',
      options: [
        { value: 'c1', label: 'Nenhum — troponina/BNP normais, sem disfunção de VD' },
        { value: 'c2', label: 'Um positivo — troponina/BNP elevados OU disfunção de VD' },
        { value: 'c3', label: 'Ambos — troponina/BNP elevados E disfunção de VD' },
      ],
    },
    'pre-falencia': {
      title: 'Avaliação hemodinâmica detalhada',
      options: [
        { value: 'd1', label: 'Hipotensão transitória/recorrente SEM sinais de hipoperfusão' },
        {
          value: 'd2',
          label:
            'Hipoperfusão ou disfunção orgânica (lactato elevado, oligúria, alteração consciência)',
        },
        { value: 'manter-c3', label: 'Sem sinais de pré-falência → manter C3' },
      ],
    },
    respiratorio: {
      title: 'Modificador respiratório (R)',
      options: [
        { value: 'sem-r', label: 'Sem hipoxemia, taquipneia ou necessidade de O₂' },
        { value: 'com-r', label: 'Com hipoxemia, taquipneia ou necessidade de O₂ suplementar' },
      ],
    },
  } satisfies Record<TepQuestionId, { title: string; options: readonly TepOption<TepAnswer>[] }>,
  rvCriteria: {
    title: 'Critérios de disfunção de VD (eco ou TC)',
    lines: [
      'VD/VE > 0,9 (apical 4C) | TAPSE < 16 mm | McConnell | D-sign',
      'Combinação TAPSE < 16 + VD/VE > 1 tem melhor desempenho (HR 6,5; VPN 95,6%)',
    ],
  },
  preFailureNote: 'Nota: se hipotensão persistente → voltar e classificar como instável.',
  spesi: {
    calculate: 'Calcular sPESI',
    proceedLow: 'Prosseguir como categoria B',
    proceedHigh: 'Prosseguir como categoria C+',
  },
  pesi: {
    calculate: 'Alternativa: PESI completo',
    hint: 'Escore original com 11 variáveis. Classe I–II = baixo risco. Classe III+ = risco elevado.',
    proceedLow: 'Prosseguir como categoria B (baixo risco)',
    proceedHigh: 'Prosseguir como categoria C+ (risco elevado)',
  },
  hestia: {
    calculate: 'Calcular Hestia',
    hint: 'Todos negativos → ambulatorial. ≥ 1 positivo → internação.',
    proceed: 'Prosseguir — localização do trombo',
  },
  back: 'Voltar ao diagnóstico',
} as const;

export const MANAGEMENT = {
  title: 'Manejo por categoria',
  anticoagulationSchemes: {
    kind: 'referencia',
    section: 'anticoagulacao',
    label: 'Ver esquemas de anticoagulação',
  } satisfies TepLink,
  contraindications: {
    kind: 'referencia',
    section: 'contraindicacoes',
    label: 'Ver contraindicações',
  } satisfies TepLink,
  /** Nas categorias com HNF (D a E): leva ao protocolo de heparina de Infusões. */
  heparin: {
    kind: 'infusao',
    drug: 'heparina',
    label: 'Protocolo de heparina (HNF) em Infusões',
  } satisfies TepLink,
  restart: 'Reiniciar roteiro',
} as const;

/** Rótulos dos quatro passos do roteiro, na ordem do ANY. */
export const TEP_STEP_LABELS = ['Estabilidade', 'Diagnóstico', 'Classificação', 'Conduta'] as const;
