/**
 * Guia de antídotos (CC-323): os 15 do ToxPath do ANY, 11 marcados como
 * disponíveis e 4 como não disponíveis. Doses e textos iguais aos do ANY,
 * com acentuação corrigida. A disponibilidade é a que o ANY declarava; vale
 * para o serviço de origem e está na revisão clínica (CC-310).
 */

export const ANTIDOTE_IDS = [
  'naloxona',
  'nac',
  'atropina',
  'bicarbonato',
  'gluconato',
  'flumazenil',
  'azulmetileno',
  'piridoxina',
  'hidroxocobalamina',
  'fomepizol',
  'lipidica',
  'pralidoxima',
  'glucagon',
  'fab-antidigoxina',
  'fisostigmina',
] as const;

export type AntidoteId = (typeof ANTIDOTE_IDS)[number];

/** Calculadora embutida no card do antídoto. */
export type AntidoteCalculator = 'nac' | 'atropina';

export interface AntidoteSection {
  title: string;
  lines: readonly string[];
}

export interface Antidote {
  id: AntidoteId;
  name: string;
  indication: string;
  available: boolean;
  /** Termos extras da busca (droga, intoxicação, nome comercial), como no ANY. */
  searchTerms: string;
  sections: readonly AntidoteSection[];
  /** Alertas (vermelho no ANY). */
  warnings: readonly string[];
  /** Observações (azul no ANY). */
  infos: readonly string[];
  calculator?: AntidoteCalculator;
}

export const ANTIDOTES: readonly Antidote[] = [
  // Disponíveis
  {
    id: 'naloxona',
    name: 'Naloxona',
    indication: 'Intoxicação por opioides',
    available: true,
    searchTerms:
      'naloxona narcan opioide opiáceo heroina fentanil morfina codeina tramadol metadona oxicodona',
    sections: [
      { title: 'Indicação', lines: ['Depressão respiratória + miose + suspeita de opioide'] },
      {
        title: 'Dose inicial',
        lines: [
          '0,04 a 0,4 mg IV (iniciar com dose baixa se dependente)',
          'Se sem resposta: até 2 mg IV',
          'Repetir a cada 2-3 minutos se necessário',
        ],
      },
      { title: 'Infusão contínua', lines: ['Se recorrência: 2/3 da dose efetiva/hora em BIC'] },
    ],
    warnings: [
      'Meia-vida curta (30-90 min) — risco de recorrência. Observar por pelo menos 4-6h após última dose.',
    ],
    infos: [
      'Em dependentes, titular para FR > 12, não para consciência plena (evitar abstinência).',
    ],
  },
  {
    id: 'nac',
    name: 'N-acetilcisteína (NAC)',
    indication: 'Intoxicação por paracetamol',
    available: true,
    searchTerms: 'n-acetilcisteina nac acetilcisteina paracetamol acetaminofeno hepatotoxicidade',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'Nível sérico de paracetamol acima da linha de tratamento no nomograma de Rumack-Matthew ou ingestão > 150 mg/kg',
        ],
      },
      {
        title: 'Protocolo IV (21 horas) — Prescott',
        lines: [
          '1ª etapa: 150 mg/kg em 200 mL SF em 1 hora',
          '2ª etapa: 50 mg/kg em 500 mL SF em 4 horas',
          '3ª etapa: 100 mg/kg em 1000 mL SF em 16 horas',
        ],
      },
      { title: 'Dose total', lines: ['300 mg/kg em 21 horas'] },
    ],
    warnings: [
      'Reações anafilactoides são comuns na 1ª hora. Reduzir velocidade de infusão se ocorrerem.',
    ],
    infos: [
      'Maior eficácia se iniciado em até 8h da ingestão. Ainda útil até 24h ou mais se hepatotoxicidade.',
    ],
    calculator: 'nac',
  },
  {
    id: 'atropina',
    name: 'Atropina',
    indication: 'Síndrome colinérgica / Organofosforados',
    available: true,
    searchTerms:
      'atropina organofosforado carbamato colinergico inseticida pesticida sialorreia broncorreia',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'Síndrome colinérgica: broncorreia, sialorreia, bradicardia, miose, diarreia, vômitos',
        ],
      },
      { title: 'Apresentação disponível', lines: ['Atropina 0,25 mg/mL — ampola 1 mL'] },
      {
        title: 'Dose inicial',
        lines: ['1-2 mg IV (adultos) = 4-8 ampolas', '0,02-0,05 mg/kg IV (crianças)'],
      },
      {
        title: 'Titulação',
        lines: [
          'Dobrar dose a cada 5 minutos até controle das secreções',
          'Endpoint: secreções secas (não FC ou pupilas)',
        ],
      },
      { title: 'Manutenção', lines: ['Infusão contínua: 20% da dose de ataque/hora'] },
    ],
    warnings: [
      'Doses muito altas podem ser necessárias (centenas de mg). Não há dose máxima absoluta.',
    ],
    infos: ['Pralidoxima NÃO disponível. Atropina é o pilar do tratamento.'],
    calculator: 'atropina',
  },
  {
    id: 'bicarbonato',
    name: 'Bicarbonato de Sódio',
    indication: 'Bloqueadores de canal de sódio / ADT',
    available: true,
    searchTerms:
      'bicarbonato de sódio antidepressivo triciclico adt bloqueador canal sódio cocaina qrs arritmia',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'QRS > 100 ms ou arritmia ventricular por: ADT, cocaína, antiarrítmicos classe I, carbamazepina',
        ],
      },
      { title: 'Dose', lines: ['1-2 mEq/kg IV em bolus', 'Repetir até QRS < 100 ms'] },
      { title: 'Meta', lines: ['pH arterial: 7,50-7,55', 'Sódio sérico: 150-155 mEq/L'] },
    ],
    warnings: ['Monitorar pH, K+ e Na+. Hipocalemia pode ocorrer com alcalose.'],
    infos: [],
  },
  {
    id: 'gluconato',
    name: 'Gluconato de Cálcio',
    indication: 'Bloqueadores de canal de cálcio / Ác. fluorídrico',
    available: true,
    searchTerms:
      'gluconato de cálcio cálcio bloqueador canal cálcio bcc verapamil diltiazem amlodipino fluoridrico hipercalemia',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'Intoxicação por BCC (verapamil, diltiazem), ácido fluorídrico, hipercalemia grave',
        ],
      },
      {
        title: 'Dose para BCC',
        lines: [
          'Gluconato de cálcio 10%: 20-30 mL IV (2-3 g)',
          'ou Cloreto de cálcio 10%: 10 mL IV (1 g) — preferir via central',
        ],
      },
      {
        title: 'Manutenção',
        lines: ['Infusão: 0,5-2 mL/kg/h de gluconato 10%', 'Meta: cálcio ionizado 1,5-2x o normal'],
      },
    ],
    warnings: [
      'Cloreto de cálcio é vesicante — preferir via central. Gluconato pode ir em acesso periférico.',
    ],
    infos: [],
  },
  {
    id: 'flumazenil',
    name: 'Flumazenil',
    indication: 'Intoxicação por benzodiazepínicos',
    available: true,
    searchTerms: 'flumazenil lanexat benzodiazepínico bzd diazepam midazolam alprazolam clonazepam',
    sections: [
      { title: 'Uso restrito', lines: ['NÃO usar rotineiramente. Alto risco de convulsões.'] },
      {
        title: 'Contraindicações',
        lines: [
          'Uso crônico de BZD (risco de abstinência)',
          'Coingestão de pró-convulsivantes (ADT, cocaína)',
          'História de convulsões',
          'ECG com QRS alargado',
        ],
      },
      {
        title: 'Dose (se indicado)',
        lines: [
          '0,2 mg IV em 30 segundos',
          'Repetir 0,3 mg após 30s se sem resposta',
          'Máximo: 3-5 mg',
        ],
      },
    ],
    warnings: ['Na dúvida, NÃO usar. Suporte ventilatório é mais seguro.'],
    infos: [],
  },
  {
    id: 'azulmetileno',
    name: 'Azul de Metileno',
    indication: 'Metemoglobinemia',
    available: true,
    searchTerms:
      'azul de metileno metemoglobinemia metemoglobina dapsona benzocaina nitritos cianose',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'MetHb > 20-30% ou sintomático (cianose refratária a O2, dispneia, alteração de consciência)',
        ],
      },
      {
        title: 'Dose',
        lines: [
          '1-2 mg/kg IV em 5 minutos',
          'Diluir em SF 50-100 mL',
          'Repetir em 1h se necessário (máx 7 mg/kg)',
        ],
      },
    ],
    warnings: ['Contraindicado em deficiência de G6PD (pode causar hemólise).'],
    infos: ['Causas: dapsona, benzocaína, nitritos, anilinas. SpO₂ falsamente baixa na oximetria.'],
  },
  {
    id: 'piridoxina',
    name: 'Piridoxina (Vitamina B6)',
    indication: 'Intoxicação por isoniazida',
    available: true,
    searchTerms: 'piridoxina vitamina b6 isoniazida inh convulsão hidrazina',
    sections: [
      { title: 'Indicação', lines: ['Convulsões refratárias a BZD + suspeita de isoniazida'] },
      {
        title: 'Dose',
        lines: [
          'Grama por grama da dose ingerida de INH',
          'Se dose desconhecida: 5 g IV (adultos)',
          'Taxa: 0,5-1 g/min',
        ],
      },
    ],
    warnings: [],
    infos: [],
  },
  {
    id: 'hidroxocobalamina',
    name: 'Hidroxocobalamina',
    indication: 'Intoxicação por cianeto',
    available: true,
    searchTerms: 'hidroxocobalamina cianokit cianeto fumaca incendio acido cianidrico',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'Suspeita de intoxicação por cianeto (vítima de incêndio + acidose lática + rebaixamento)',
        ],
      },
      {
        title: 'Dose',
        lines: [
          '5 g IV em 15 minutos (adultos)',
          'Pediátrico: 70 mg/kg',
          'Repetir 5 g se necessário',
        ],
      },
    ],
    warnings: ['Colore fluidos corporais em vermelho (interfere com exames laboratoriais).'],
    infos: [],
  },
  {
    id: 'fomepizol',
    name: 'Fomepizol / Etanol',
    indication: 'Álcoois tóxicos (metanol, etilenoglicol)',
    available: true,
    searchTerms: 'fomepizol etanol metanol etilenoglicol alcool toxico antifreeze',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'Suspeita de intoxicação por metanol ou etilenoglicol',
          'Gap osmótico > 10 ou acidose com ânion gap',
        ],
      },
      {
        title: 'Fomepizol (se disponível)',
        lines: [
          'Ataque: 15 mg/kg IV',
          'Manutenção: 10 mg/kg a cada 12h',
          'Após 48h: 15 mg/kg a cada 12h',
        ],
      },
      {
        title: 'Etanol IV (alternativa)',
        lines: [
          'Ataque: 0,6-0,8 g/kg IV',
          'Manutenção: 66-154 mg/kg/h',
          'Meta: alcoolemia 100-150 mg/dL',
        ],
      },
    ],
    warnings: ['Hemodiálise indicada se: acidose grave, IRA, déficit visual, nível elevado.'],
    infos: [],
  },
  {
    id: 'lipidica',
    name: 'Emulsão Lipídica 20%',
    indication: 'Toxicidade por anestésicos locais (LAST)',
    available: true,
    searchTerms:
      'emulsao lipídica intralipid anestésico local bupivacaina lidocaina last lipid rescue',
    sections: [
      {
        title: 'Indicação',
        lines: [
          'Toxicidade sistêmica por anestésicos locais (LAST)',
          'Considerar em intoxicações graves por lipofílicos',
        ],
      },
      {
        title: 'Dose',
        lines: [
          'Bolus: 1,5 mL/kg IV em 1 minuto',
          'Infusão: 0,25 mL/kg/min por 30-60 min',
          'Repetir bolus 1-2x se instabilidade persistir',
        ],
      },
    ],
    warnings: ['Dose máxima total: 12 mL/kg. Não usar propofol como substituto.'],
    infos: [],
  },
  // Não disponíveis
  {
    id: 'pralidoxima',
    name: 'Pralidoxima',
    indication: 'Organofosforados (reativador de colinesterase)',
    available: false,
    searchTerms: 'pralidoxima 2-pam organofosforado reativador colinesterase',
    sections: [
      {
        title: 'Informação',
        lines: ['Não disponível no Brasil. Usar ATROPINA como pilar do tratamento.'],
      },
    ],
    warnings: [],
    infos: [],
  },
  {
    id: 'glucagon',
    name: 'Glucagon',
    indication: 'Betabloqueadores / BCC',
    available: false,
    searchTerms: 'glucagon betabloqueador propranolol atenolol metoprolol bradicardia',
    sections: [
      {
        title: 'Informação',
        lines: ['Disponibilidade limitada. Alternativa: insulina em alta dose + glicose (HIE).'],
      },
    ],
    warnings: [],
    infos: [],
  },
  {
    id: 'fab-antidigoxina',
    name: 'Fab Antidigoxina',
    indication: 'Intoxicação digitálica',
    available: false,
    searchTerms: 'fab antidigoxina digibind digoxina digitalico digitalis',
    sections: [
      {
        title: 'Informação',
        lines: [
          'Não disponível no Brasil. Suporte com atropina, marcapasso temporário e correção de K+.',
        ],
      },
    ],
    warnings: [],
    infos: [],
  },
  {
    id: 'fisostigmina',
    name: 'Fisostigmina',
    indication: 'Síndrome anticolinérgica grave',
    available: false,
    searchTerms: 'fisostigmina anticolinergico delirium agitação',
    sections: [
      {
        title: 'Informação',
        lines: [
          'Não disponível. Usar BENZODIAZEPÍNICOS para agitação. Suporte e resfriamento para hipertermia.',
        ],
      },
    ],
    warnings: [],
    infos: [],
  },
];

const ANTIDOTE_BY_ID = new Map(ANTIDOTES.map((antidote) => [antidote.id, antidote]));

export function getAntidote(id: AntidoteId): Antidote {
  const antidote = ANTIDOTE_BY_ID.get(id);
  if (!antidote) throw new Error(`Antídoto ${id} não existe no guia.`);
  return antidote;
}
