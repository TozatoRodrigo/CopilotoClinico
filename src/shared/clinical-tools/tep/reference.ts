import type { RecommendationClass, TepNotice } from './content';
import type { TepLink, TepReferenceSectionId } from './links';

/**
 * Referência rápida do TEP (aba "Referência" do ANY): laboratório,
 * contraindicações, eco, anticoagulação, trombólise, suporte hemodinâmico e
 * filtro de veia cava. Doses e limiares iguais aos do `TepGuide.tsx`; só
 * acentuação e tipografia mudaram (2x → 2×, ug → µg).
 */

export type TepReferenceBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string; cor?: RecommendationClass }
  | { kind: 'checklist'; items: readonly string[] }
  /** Nota em destaque (o quadro azul do ANY). */
  | { kind: 'note'; title?: string; text: string }
  | {
      kind: 'drug';
      name: string;
      text: string;
      details?: readonly string[];
      /** Linha que muda a conduta (o texto amarelo do ANY). */
      warning?: string;
      cor?: RecommendationClass;
      link?: TepLink;
    }
  | { kind: 'parameter'; name: string; threshold: string; data: string }
  | {
      kind: 'table';
      columns: readonly [string, string];
      rows: readonly (readonly [string, string])[];
    }
  | { kind: 'alert'; notice: TepNotice };

export interface TepReferenceSection {
  id: TepReferenceSectionId;
  title: string;
  blocks: readonly TepReferenceBlock[];
}

const INTUBATION_LINKS: readonly TepLink[] = [
  { kind: 'ferramenta', toolId: 'via-aerea', label: 'Intubação e via aérea' },
  { kind: 'ferramenta', toolId: 'sedacao', label: 'Sedação' },
];

export const TEP_REFERENCE: readonly TepReferenceSection[] = [
  {
    id: 'laboratorio',
    title: 'Laboratório pré-anticoagulação',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Exames recomendados antes de iniciar anticoagulação e para estratificação de risco:',
      },
      {
        kind: 'checklist',
        items: [
          'Hemograma completo (atenção às plaquetas)',
          'Coagulograma (TAP/INR, TTPa) — baseline',
          'Creatinina + clearance estimado (ClCr) — define escolha do anticoagulante',
          'Hepatograma (TGO, TGP) — hepatopatia contraindica DOACs',
          'Troponina I ou T — estratificação (C1 vs C2/C3)',
          'BNP ou NT-proBNP — estratificação adicional',
          'Lactato arterial — marcador de hipoperfusão (identifica categoria D)',
          'Tipagem sanguínea — se risco de trombólise/cirurgia',
          'Beta-hCG — mulheres em idade fértil (muda toda a conduta)',
        ],
      },
      {
        kind: 'note',
        text: 'Troponina e BNP/NT-proBNP são necessários para diferenciar C1, C2 e C3. Considere solicitar precocemente.',
      },
    ],
  },
  {
    id: 'contraindicacoes',
    title: 'Contraindicações',
    blocks: [
      { kind: 'heading', text: 'Anticoagulação — contraindicações absolutas' },
      {
        kind: 'checklist',
        items: [
          'Sangramento ativo maior',
          'Plaquetas < 25.000/µL',
          'Coagulopatia grave não corrigida',
        ],
      },
      { kind: 'heading', text: 'Trombólise sistêmica — contraindicações absolutas' },
      {
        kind: 'checklist',
        items: [
          'AVC hemorrágico prévio (qualquer tempo)',
          'AVC isquêmico < 3 meses',
          'Neoplasia intracraniana conhecida',
          'Sangramento ativo (exceto menstruação)',
          'Cirurgia intracraniana ou espinhal < 3 meses',
          'Trauma craniano fechado < 3 meses',
          'Diátese hemorrágica conhecida',
        ],
      },
      { kind: 'heading', text: 'Trombólise sistêmica — contraindicações relativas' },
      {
        kind: 'checklist',
        items: [
          'PAS > 180 mmHg',
          'Uso atual de anticoagulante',
          'Gestação',
          'Punção vascular não compressível',
          'RCP prolongada (> 10 minutos)',
          'Cirurgia de grande porte < 3 semanas',
          'Sangramento interno recente (2–4 semanas)',
        ],
      },
    ],
  },
  {
    id: 'eco',
    title: 'Eco à beira-leito — disfunção de VD',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Parâmetros para definir disfunção de VD na classificação AHA/ACC. A acurácia aumenta com > 1 parâmetro presente.',
      },
      {
        kind: 'parameter',
        name: 'Relação VD/VE (apical 4 câmaras)',
        threshold: 'Anormal: > 0,9',
        data: 'Sens 66–83% | Esp 75–77% para disfunção VD. RR 1,61 para morte a curto prazo (Cimini 2023).',
      },
      {
        kind: 'parameter',
        name: 'TAPSE (modo M, anel tricúspide)',
        threshold: 'Anormal: < 16 mm',
        data: 'HR 3,8 para desfecho adverso. Preditor independente de mortalidade (Cimini 2023).',
      },
      {
        kind: 'parameter',
        name: 'TAPSE + VD/VE combinados',
        threshold: 'TAPSE < 16 mm E VD/VE > 1',
        data: 'HR 6,5 (IC95% 3,2–13,3) para desfecho adverso. VPN 95,6%. Melhor desempenho combinado.',
      },
      {
        kind: 'parameter',
        name: 'Sinal de McConnell',
        threshold: 'Acinesia de parede livre com contratilidade apical preservada',
        data: 'Sens 22% | Esp 97% para diagnóstico de TEP. OR 8,38 para choque normotensivo em TEP intermediária (Zhang 2024).',
      },
      {
        kind: 'parameter',
        name: 'D-sign (septo achatado)',
        threshold: 'Septo interventricular abaulado para VE',
        data: 'Sens 31% | Esp 98% | LR+ 13,6 (de Wit 2021). Alta especificidade quando presente.',
      },
      {
        kind: 'parameter',
        name: 'TAPSE/PASP',
        threshold: 'Anormal: < 0,34 mm/mmHg',
        data: 'Sens 97% | Esp 91% para IC baixo. OR 2,63 para choque normotensivo (Yuriditsky 2024). Melhor preditor isolado.',
      },
      {
        kind: 'note',
        title: 'Limitações',
        text: 'Os dados acima são predominantemente prognósticos (predizem desfechos adversos), não diagnósticos. A presença de disfunção de VD no eco não confirma TEP, mas estratifica risco em TEP confirmada. Eco à beira-leito não substitui CTPA para diagnóstico.',
      },
    ],
  },
  {
    id: 'anticoagulacao',
    title: 'Anticoagulação — esquemas e doses',
    blocks: [
      { kind: 'heading', text: 'Princípios gerais' },
      { kind: 'paragraph', cor: '1', text: 'DOAC preferido sobre AVK para anticoagulação oral.' },
      {
        kind: 'paragraph',
        cor: '1',
        text: 'HBPM preferida sobre HNF quando parenteral necessário.',
      },
      { kind: 'heading', text: 'DOACs — dose inicial' },
      { kind: 'drug', name: 'Rivaroxabana', text: '15 mg VO 2×/dia por 21 dias → 20 mg 1×/dia' },
      { kind: 'drug', name: 'Apixabana', text: '10 mg VO 2×/dia por 7 dias → 5 mg 2×/dia' },
      { kind: 'heading', text: 'HBPM' },
      {
        kind: 'drug',
        name: 'Enoxaparina',
        text: '1 mg/kg SC 12/12 h',
        details: ['Ampolas: 40 mg/0,4 mL | 60 mg/0,6 mL | 80 mg/0,8 mL'],
      },
      { kind: 'heading', text: 'HNF' },
      {
        kind: 'drug',
        name: 'Heparina não fracionada',
        text: 'Bolus 80 UI/kg IV + infusão contínua 18 UI/kg/h',
        details: ['Ajustar por TTPa a cada 6 h.'],
        link: { kind: 'infusao', drug: 'heparina', label: 'Calculadora de heparina' },
      },
      { kind: 'heading', text: 'Situações especiais' },
      {
        kind: 'table',
        columns: ['Situação', 'Recomendação'],
        rows: [
          ['Gestante', 'HBPM (DOACs e AVK contraindicados)'],
          ['SAAF trombótica', 'AVK (DOACs inferiores para eventos arteriais) COR 1'],
          ['DRC grave (ClCr < 30)', 'HNF (HBPM com cautela, ajustar dose)'],
          ['Câncer ativo', 'DOAC ou HBPM (preferidos sobre AVK) COR 1'],
          [
            'Obesidade grau III (IMC > 40)',
            'DOAC razoável; se HBPM, considere redução de dose COR 2b',
          ],
          ['Hepatopatia leve-moderada', 'Apixabana/rivaroxabana com cautela; grave → HNF'],
        ],
      },
    ],
  },
  {
    id: 'trombolise',
    title: 'Trombólise sistêmica',
    blocks: [
      { kind: 'heading', text: 'Indicações por categoria' },
      {
        kind: 'table',
        columns: ['Categoria', 'Recomendação'],
        rows: [
          ['E1–E2', 'COR 2a — Razoável se risco de sangramento aceitável'],
          ['D1–D2', 'COR 2b — Pode ser considerada para prevenir deterioração'],
          ['C3', 'COR 2b — Benefício incerto'],
          ['A — C2', 'COR 3: Dano — Não recomendada — risco de sangramento maior e HIC'],
        ],
      },
      { kind: 'heading', text: 'Doses' },
      { kind: 'drug', name: 'Alteplase (rt-PA)', text: '100 mg IV em 2 horas (dose padrão)' },
      {
        kind: 'drug',
        name: 'Dose reduzida',
        text: '50 mg IV em 2 horas — pode ser considerada para reduzir risco de sangramento',
        cor: '2b',
      },
      {
        kind: 'note',
        text: 'Trombólise de resgate pode beneficiar pacientes que deterioram sob anticoagulação isolada.',
      },
    ],
  },
  {
    id: 'suporte',
    title: 'Suporte hemodinâmico no DE',
    blocks: [
      {
        kind: 'drug',
        name: 'Norepinefrina',
        text: 'Vasopressor de 1ª escolha',
        details: ['Dose: 0,1–0,5 mcg/kg/min (titular). Até 15 mcg/min: pouco efeito na RVP.'],
        warning:
          'Acima de 15 mcg/min: pode aumentar RVP → considere segundo agente (vasopressina, fenilefrina).',
        link: { kind: 'infusao', drug: 'noradrenalina', label: 'Calculadora de noradrenalina' },
      },
      {
        kind: 'drug',
        name: 'Dobutamina',
        text: 'Inotrópico adjunto',
        details: [
          'Dose: até 10 mcg/kg/min. Pode aumentar IC às custas de queda da RVS.',
          'Considere se baixo débito persistente apesar de vasopressores.',
        ],
        link: { kind: 'infusao', drug: 'dobutamina', label: 'Calculadora de dobutamina' },
      },
      { kind: 'heading', text: 'Suporte respiratório' },
      {
        kind: 'paragraph',
        text: 'CNAF pode ser considerada antes de IOT para melhorar oxigenação.',
      },
      {
        kind: 'alert',
        notice: {
          tone: 'critical',
          title: 'Atenção — sedação e IOT',
          text: 'Podem causar colapso hemodinâmico catastrófico em disfunção de VD. Sedativos e analgésicos reduzem mecanismos compensatórios. Evitar IOT salvo indicação forte (hipoxemia refratária, proteção de via aérea). Equipe pronta com vasopressores/inotrópicos ou VA-ECMO.',
          links: INTUBATION_LINKS,
        },
      },
      { kind: 'heading', text: 'Vasodilatadores pulmonares inalatórios' },
      {
        kind: 'paragraph',
        cor: '2b',
        text: 'Podem ser considerados para reduzir pós-carga de VD em categorias C2–E.',
      },
    ],
  },
  {
    id: 'filtro-vci',
    title: 'Filtro de veia cava inferior',
    blocks: [
      {
        kind: 'paragraph',
        cor: '2a',
        text: 'Considere apenas se contraindicação absoluta a anticoagulação com TEP agudo e risco de recorrência.',
      },
      {
        kind: 'paragraph',
        cor: '3',
        text: 'Não recomendado rotineiramente em pacientes que podem ser anticoagulados — sem benefício de mortalidade e aumento de risco de TVP.',
      },
      {
        kind: 'note',
        text: 'Se colocado, retirar assim que possível (idealmente < 54 dias). Após 90 dias, a retirada torna-se progressivamente mais difícil.',
      },
    ],
  },
];

export function getTepReferenceSection(id: TepReferenceSectionId): TepReferenceSection {
  const section = TEP_REFERENCE.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Seção "${id}" ausente da referência do TEP.`);
  return section;
}
