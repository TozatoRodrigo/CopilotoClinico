import { requireValue, type FormulaCalculator, type ScoreCalculator } from '../calculator';
import { yesNoItem } from '../calculators/items';
import { TEP_PROVENANCE } from './provenance';

/**
 * Gravidade e destino do TEP confirmado, do `TepGuide.tsx` do ANY: sPESI,
 * PESI, Bova e Hestia. Itens, pontos e faixas iguais aos de lá
 * (`SPESI_ITEMS`, `PESI_ITEMS`, `classifyPesi`, `BOVA_ITEMS`, `classifyBova`,
 * `HESTIA_ITEMS`).
 */

const CATEGORY = 'Tromboembolismo pulmonar';

export const SPESI: ScoreCalculator = {
  kind: 'score',
  id: 'spesi',
  name: 'sPESI (PESI simplificado)',
  aliases: ['spesi', 'pesi simplificado', 'tep', 'gravidade', 'estratificação'],
  category: CATEGORY,
  description: 'Seis critérios: 0 é baixo risco (categoria B); ≥ 1 é risco elevado (C ou mais).',
  reference: {
    why: 'Separa o TEP sintomático de baixo risco (categoria B) do de risco elevado (categoria C ou mais) na classificação do roteiro.',
    whenToUse: 'TEP confirmado e sintomático, no passo de classificação.',
    pearlsPitfalls: [
      '0 = baixo risco (categoria B). ≥ 1 = risco elevado (categoria C ou superior).',
    ],
    citation:
      'Jiménez D, Aujesky D, Moores L, et al. Simplification of the pulmonary embolism severity index for prognostication in patients with acute symptomatic pulmonary embolism. Arch Intern Med. 2010;170(15):1383-9.',
  },
  provenance: TEP_PROVENANCE,
  items: [
    yesNoItem('age', 'Idade > 80 anos'),
    yesNoItem('cancer', 'Câncer ativo'),
    yesNoItem('cardiopulmonary', 'Doença cardiopulmonar crônica'),
    yesNoItem('sbp', 'PAS < 100 mmHg'),
    yesNoItem('hr', 'FC ≥ 110 bpm'),
    yesNoItem('spo2', 'SpO₂ < 90%'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo-risco',
        upTo: { value: 0, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'Categoria B na classificação do roteiro.',
      },
    ],
    otherwise: {
      id: 'risco-elevado',
      label: 'Risco elevado (≥ 1)',
      tone: 'critical',
      action: 'Categoria C ou superior na classificação do roteiro.',
    },
  },
};

const PESI_ITEMS = [
  yesNoItem('male', 'Sexo masculino', 10),
  yesNoItem('cancer', 'Câncer', 30),
  yesNoItem('heart-failure', 'Insuficiência cardíaca', 10),
  yesNoItem('lung-disease', 'Doença pulmonar crônica', 10),
  yesNoItem('hr', 'FC ≥ 110 bpm', 20),
  yesNoItem('sbp', 'PAS < 100 mmHg', 30),
  yesNoItem('rr', 'FR ≥ 30 irpm', 20),
  yesNoItem('temperature', 'Temperatura < 36 °C', 20),
  yesNoItem('mental-status', 'Alteração do nível de consciência', 60),
  yesNoItem('spo2', 'SpO₂ < 90%', 20),
];

const PESI_LOW = 'Baixo risco (classe I–II): no roteiro, segue como categoria B.';
const PESI_HIGH =
  'Risco elevado (classe III ou mais): no roteiro, segue como categoria C ou superior.';

export const PESI: FormulaCalculator = {
  kind: 'formula',
  id: 'pesi',
  name: 'PESI (Pulmonary Embolism Severity Index)',
  aliases: ['pesi', 'tep', 'gravidade', 'mortalidade', 'estratificação'],
  category: CATEGORY,
  description: 'Idade somada a dez critérios; classes I a V de risco.',
  reference: {
    why: 'Alternativa ao sPESI no roteiro: classe I–II é baixo risco; classe III ou mais, risco elevado.',
    whenToUse: 'TEP confirmado e sintomático, no passo de classificação.',
    pearlsPitfalls: [
      'Escore original com 11 variáveis: a idade em anos é somada diretamente ao escore.',
      'Classe I–II = baixo risco. Classe III+ = risco elevado.',
    ],
    citation:
      'Aujesky D, Obrosky DS, Stone RA, et al. Derivation and validation of a prognostic model for pulmonary embolism. Am J Respir Crit Care Med. 2005;172(8):1041-6.',
  },
  provenance: TEP_PROVENANCE,
  inputs: [{ id: 'age', label: 'Idade', unit: 'anos', min: 18, max: 120, step: 1 }],
  items: PESI_ITEMS,
  decimals: 0,
  unit: 'pontos',
  // Idade em anos completos, como o `parseInt` do ANY.
  compute: (values) =>
    Math.trunc(requireValue(values, 'age')) +
    PESI_ITEMS.reduce((sum, item) => sum + requireValue(values, item.id), 0),
  interpretation: {
    bands: [
      {
        id: 'classe-i',
        upTo: { value: 65, inclusive: true },
        label: 'Classe I — risco muito baixo',
        tone: 'neutral',
        action: PESI_LOW,
      },
      {
        id: 'classe-ii',
        upTo: { value: 85, inclusive: true },
        label: 'Classe II — risco baixo',
        tone: 'neutral',
        action: PESI_LOW,
      },
      {
        id: 'classe-iii',
        upTo: { value: 105, inclusive: true },
        label: 'Classe III — risco intermediário',
        tone: 'attention',
        action: PESI_HIGH,
      },
      {
        id: 'classe-iv',
        upTo: { value: 125, inclusive: true },
        label: 'Classe IV — risco alto',
        tone: 'attention',
        action: PESI_HIGH,
      },
    ],
    otherwise: {
      id: 'classe-v',
      label: 'Classe V — risco muito alto',
      tone: 'critical',
      action: PESI_HIGH,
    },
  },
};

export const BOVA: ScoreCalculator = {
  kind: 'score',
  id: 'bova',
  name: 'Escore de Bova',
  aliases: ['bova', 'tep', 'risco intermediário', 'complicações', 'troponina'],
  category: CATEGORY,
  description: 'Risco de complicações no TEP hemodinamicamente estável: estágios I a III.',
  reference: {
    why: 'Estratificação de risco de complicações em TEP hemodinamicamente estável.',
    whenToUse: 'TEP confirmado em paciente hemodinamicamente estável.',
    pearlsPitfalls: ['Estágio I: 0–2 pontos. Estágio II: 3–4. Estágio III: ≥ 5.'],
    citation:
      'Bova C, Sanchez O, Prandoni P, et al. Identification of intermediate-risk patients with acute symptomatic pulmonary embolism. Eur Respir J. 2014;44(3):694-703.',
  },
  provenance: TEP_PROVENANCE,
  items: [
    yesNoItem('sbp', 'PAS 90–100 mmHg', 2),
    yesNoItem('troponin', 'Troponina elevada', 2),
    yesNoItem('rv-dysfunction', 'Disfunção de VD (eco ou TC)', 2),
    yesNoItem('hr', 'FC ≥ 110 bpm', 1),
  ],
  interpretation: {
    bands: [
      {
        id: 'estagio-i',
        upTo: { value: 2, inclusive: true },
        label: 'Estágio I — baixo risco de complicações',
        tone: 'neutral',
        action: 'Baixo risco de complicações relacionadas ao TEP.',
      },
      {
        id: 'estagio-ii',
        upTo: { value: 4, inclusive: true },
        label: 'Estágio II — risco intermediário',
        tone: 'attention',
        action: 'Risco intermediário de complicações relacionadas ao TEP.',
      },
    ],
    otherwise: {
      id: 'estagio-iii',
      label: 'Estágio III — risco elevado de complicações',
      tone: 'critical',
      action: 'Risco elevado de complicações relacionadas ao TEP.',
    },
  },
};

export const HESTIA: ScoreCalculator = {
  kind: 'score',
  id: 'hestia',
  name: 'Critérios de Hestia',
  aliases: ['hestia', 'tep', 'ambulatorial', 'alta', 'internação'],
  category: CATEGORY,
  description: 'Onze critérios: todos negativos permitem considerar tratamento ambulatorial.',
  reference: {
    why: 'Elegibilidade para tratamento ambulatorial do TEP de baixo risco.',
    whenToUse: 'TEP sintomático de baixo risco (sPESI 0 ou PESI I–II), antes de decidir o destino.',
    pearlsPitfalls: [
      'Se TODOS negativos → considere tratamento ambulatorial. Se ≥ 1 positivo → internação.',
    ],
    citation:
      'Zondag W, Mos IC, Creemers-Schild D, et al. Outpatient treatment in patients with acute pulmonary embolism: the Hestia Study. J Thromb Haemost. 2011;9(8):1500-7.',
  },
  provenance: TEP_PROVENANCE,
  items: [
    yesNoItem('unstable', 'Instabilidade hemodinâmica'),
    yesNoItem('thrombolysis', 'Necessidade de trombólise ou embolectomia'),
    yesNoItem('bleeding', 'Sangramento ativo ou alto risco de sangramento'),
    yesNoItem('oxygen', 'Necessidade de O₂ > 24 h para manter SpO₂ > 90%'),
    yesNoItem('on-anticoagulation', 'TEP diagnosticado durante anticoagulação'),
    yesNoItem('pain', 'Dor intensa necessitando analgesia IV > 24 h'),
    yesNoItem('reason', 'Razão médica ou social para internação > 24 h'),
    yesNoItem('renal', 'Clearance de creatinina < 30 mL/min'),
    yesNoItem('liver', 'Hepatopatia grave'),
    yesNoItem('pregnant', 'Gestante'),
    yesNoItem('hit', 'Antecedente de trombocitopenia induzida por heparina'),
  ],
  interpretation: {
    bands: [
      {
        id: 'negativo',
        upTo: { value: 0, inclusive: true },
        label: 'Hestia negativo',
        tone: 'neutral',
        action: 'Considere tratamento ambulatorial.',
      },
    ],
    otherwise: {
      id: 'positivo',
      label: 'Hestia positivo',
      tone: 'critical',
      action: 'Considere internação.',
    },
  },
};
