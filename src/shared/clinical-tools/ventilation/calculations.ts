import { findBand, requireValue, type Interpretation } from '../calculator';
import { formatDecimal } from '../numbers';
import { VENTILATION_REFERENCES } from './content';
import type {
  CrossCheck,
  UsualRange,
  VentilationCalculation,
  VentilationInput,
  VentilationOutcome,
  VentilationReading,
} from './types';

/**
 * As 14 contas do VM Guide do ANY v4 (`vmData.ts` e as calculadoras de
 * `VmGuide.tsx`). Fórmula, faixa de interpretação, texto do resultado, casas
 * decimais e os 18 avisos de faixa habitual são os do ANY; o teste
 * diferencial (tests/clinical-tools/ventilation-differential.spec.ts) roda a
 * página congelada e compara.
 *
 * O que o porte acrescentou, por segurança (ADR-017), e que está no arquivo
 * de achados (docs/ferramentas/revisao-clinica/ventilacao-mecanica.md):
 * faixa aceita em todo campo (fora dela não há conta) e as regras entre
 * campos que impedem número sem sentido (platô abaixo da PEEP, pico abaixo
 * do platô, mais eventos que ciclos).
 *
 * Texto de faixa: o ANY juntava rótulo e ação ("Elevada — considere …"); aqui
 * o rótulo vai na faixa e a ação, em linguagem de sugestão, em `action`
 * (vazia quando o ANY não sugeria nada).
 */

const CMH2O = 'cmH₂O';

/** "Valor fora da faixa habitual (5-60 cmH₂O)": o texto de cada aviso é o do ANY. */
function usual(min: number, max: number, message: string): UsualRange {
  return { min, max, message };
}

const HABITUAL = 'Valor fora da faixa habitual';

/**
 * FiO₂ digitada em porcentagem, como no visor do ventilador e no gradiente
 * A-a; o ANY pedia fração (0,21 a 1,0). A conta recebe a fração (`fio2Fraction`),
 * então o número é o mesmo do ANY. A faixa aceita é a do próprio aviso do ANY.
 */
function fio2Input(id: string, placeholder: string, warns: boolean): VentilationInput {
  return {
    id,
    label: 'FiO₂',
    unit: '%',
    min: 21,
    max: 100,
    step: 1,
    placeholder,
    ...(warns ? { usual: usual(21, 100, 'FiO₂ deve estar entre 21 e 100%') } : {}),
  };
}

/** 40 % → 0,4: o mesmo número que o ANY lia de "0.4" (divisão e leitura arredondam igual). */
function fio2Fraction(values: Readonly<Record<string, number>>, id: string): number {
  return requireValue(values, id) / 100;
}

function plateauInput(id: string, placeholder: string, message: string): VentilationInput {
  return {
    id,
    label: 'Pressão de platô (pausa)',
    unit: CMH2O,
    min: 1,
    max: 80,
    step: 1,
    placeholder,
    usual: usual(5, 45, message),
  };
}

function peepInput(id: string, placeholder: string, message: string): VentilationInput {
  return {
    id,
    label: 'PEEP',
    unit: CMH2O,
    min: 0,
    max: 40,
    step: 1,
    placeholder,
    usual: usual(0, 24, message),
  };
}

function respiratoryRateInput(
  id: string,
  label: string,
  placeholder: string,
  usualRange?: UsualRange,
): VentilationInput {
  return {
    id,
    label,
    unit: 'ipm',
    min: 1,
    max: 80,
    step: 1,
    placeholder,
    ...(usualRange ? { usual: usualRange } : {}),
  };
}

function tidalVolumeInput(id: string, message: string): VentilationInput {
  return {
    id,
    label: 'Volume corrente',
    unit: 'mL',
    min: 50,
    max: 2000,
    step: 1,
    placeholder: '400',
    usual: usual(200, 800, message),
  };
}

function plateauAbovePeep(plateau: string, peep: string): CrossCheck {
  return {
    id: 'plato-acima-da-peep',
    fields: [plateau, peep],
    message: 'A pressão de platô precisa ser maior que a PEEP.',
    holds: (values) => requireValue(values, plateau) > requireValue(values, peep),
  };
}

function reading(label: string, text: string, unit: string): VentilationReading {
  return { label, text, unit };
}

function banded(
  interpretation: Interpretation,
  value: number,
  text: string,
  label: string,
  unit: string,
  details: readonly string[] = [],
): VentilationOutcome {
  return {
    value,
    reading: reading(label, text, unit),
    details,
    band: findBand(interpretation, value),
  };
}

// ----- Peso predito -----

export const PREDICTED_BODY_WEIGHT: VentilationCalculation = {
  id: 'peso-predito',
  name: 'Peso predito (ARDSNet)',
  section: 'peso',
  aliases: ['peso ideal', 'pbw', 'ardsnet', 'volume corrente', 'vc', 'ventilação protetora'],
  concept:
    'O peso ideal (PBW) é baseado na altura e sexo do paciente, não no peso real. É usado para calcular o volume corrente em ventilação protetora, evitando volutrauma por volumes excessivos em relação ao tamanho pulmonar.',
  choices: [
    {
      id: 'sexo',
      label: 'Sexo',
      options: [
        { id: 'masculino', label: 'Masculino', points: 0 },
        { id: 'feminino', label: 'Feminino', points: 0 },
      ],
    },
  ],
  inputs: [
    {
      id: 'altura',
      label: 'Altura',
      unit: 'cm',
      min: 120,
      max: 250,
      step: 1,
      placeholder: '170',
      usual: usual(140, 210, 'Altura fora da faixa habitual (140-210 cm)'),
    },
  ],
  compute(values, choices) {
    // Masculino: 50 + 0,91 × (altura − 152,4); feminino: 45,5 + 0,91 × (altura − 152,4).
    const base = choices.sexo === 'feminino' ? 45.5 : 50;
    const pbw = Math.max(0, base + 0.91 * (requireValue(values, 'altura') - 152.4));
    // O volume corrente sai sempre do peso predito, nunca do peso real.
    return {
      value: pbw,
      reading: reading('Peso predito', formatDecimal(pbw), 'kg'),
      details: [4, 6, 8].map(
        (mlPerKg) => `VC ${mlPerKg} mL/kg: ${formatDecimal(pbw * mlPerKg, 0)} mL`,
      ),
      band: null,
    };
  },
};

// ----- Mecânica respiratória -----

const AIRWAY_RESISTANCE_BANDS: Interpretation = {
  bands: [
    {
      id: 'normal',
      label: 'Normal',
      tone: 'neutral',
      action: '',
      upTo: { value: 10, inclusive: false },
    },
    {
      id: 'elevada',
      label: 'Elevada',
      tone: 'attention',
      action: 'Considere broncoespasmo, secreções ou tubo.',
      upTo: { value: 20, inclusive: true },
    },
  ],
  otherwise: {
    id: 'muito-elevada',
    label: 'Muito elevada',
    tone: 'critical',
    action: 'Considere investigar obstrução.',
  },
};

export const AIRWAY_RESISTANCE: VentilationCalculation = {
  id: 'rva',
  name: 'Resistência de vias aéreas (Rva)',
  section: 'mecanica',
  aliases: ['resistência', 'rva', 'pico', 'broncoespasmo', 'obstrução'],
  concept:
    'A resistência de vias aéreas reflete a oposição ao fluxo de ar no sistema respiratório. Valores elevados indicam obstrução (broncoespasmo, secreções, tubo pequeno ou obstruído).',
  inputs: [
    {
      id: 'ppico',
      label: 'Pressão de pico',
      unit: CMH2O,
      min: 1,
      max: 100,
      step: 1,
      placeholder: '30',
      usual: usual(5, 60, `${HABITUAL} (5-60 cmH₂O)`),
    },
    plateauInput('ppausa', '20', `${HABITUAL} (5-45 cmH₂O)`),
    {
      id: 'fluxo',
      label: 'Fluxo inspiratório',
      unit: 'L/min',
      min: 1,
      max: 200,
      step: 1,
      placeholder: '60',
      usual: usual(20, 100, `${HABITUAL} (20-100 L/min)`),
    },
  ],
  checks: [
    {
      id: 'pico-acima-do-plato',
      fields: ['ppico', 'ppausa'],
      message: 'A pressão de pico não pode ser menor que a de platô.',
      holds: (values) => requireValue(values, 'ppico') >= requireValue(values, 'ppausa'),
    },
  ],
  interpretation: AIRWAY_RESISTANCE_BANDS,
  compute(values) {
    // Rva = (Ppico − Ppausa) ÷ fluxo em L/s.
    const fluxoLs = requireValue(values, 'fluxo') / 60;
    const rva = (requireValue(values, 'ppico') - requireValue(values, 'ppausa')) / fluxoLs;
    return banded(AIRWAY_RESISTANCE_BANDS, rva, formatDecimal(rva), 'Rva', 'cmH₂O/L/s');
  },
};

const STATIC_COMPLIANCE_BANDS: Interpretation = {
  bands: [
    {
      id: 'muito-reduzida',
      label: 'Muito reduzida',
      tone: 'critical',
      action: 'Pulmão restritivo grave.',
      upTo: { value: 30, inclusive: false },
    },
    {
      id: 'reduzida',
      label: 'Reduzida',
      tone: 'attention',
      action: 'Possível SDRA, edema, atelectasia.',
      upTo: { value: 50, inclusive: false },
    },
  ],
  otherwise: { id: 'normal', label: 'Normal (50-80 mL/cmH₂O)', tone: 'neutral', action: '' },
};

export const STATIC_COMPLIANCE: VentilationCalculation = {
  id: 'cst',
  name: 'Complacência estática (Cst)',
  section: 'mecanica',
  aliases: ['complacência', 'cst', 'platô', 'pulmão duro'],
  concept:
    'A complacência estática mede a distensibilidade do sistema respiratório (pulmão + caixa torácica). Valores baixos indicam pulmão "duro" (SDRA, fibrose, edema). Valores altos podem indicar enfisema.',
  inputs: [
    tidalVolumeInput('vc', `${HABITUAL} (200-800 mL)`),
    plateauInput('ppausa', '20', HABITUAL),
    peepInput('peep', '5', `${HABITUAL} (0-24 cmH₂O)`),
  ],
  checks: [plateauAbovePeep('ppausa', 'peep')],
  interpretation: STATIC_COMPLIANCE_BANDS,
  compute(values) {
    // Cst = VC ÷ (Pplat − PEEP).
    const cst =
      requireValue(values, 'vc') / (requireValue(values, 'ppausa') - requireValue(values, 'peep'));
    return banded(STATIC_COMPLIANCE_BANDS, cst, formatDecimal(cst), 'Cst', 'mL/cmH₂O');
  },
};

const DRIVING_PRESSURE_BANDS: Interpretation = {
  bands: [
    {
      id: 'excelente',
      label: 'Excelente',
      tone: 'neutral',
      action: 'Baixo risco de VILI.',
      upTo: { value: 10, inclusive: false },
    },
    {
      id: 'aceitavel',
      label: 'Aceitável',
      tone: 'attention',
      action: 'Meta ≤ 15 cmH₂O em SDRA.',
      upTo: { value: 15, inclusive: true },
    },
  ],
  otherwise: {
    id: 'elevada',
    label: 'Elevada',
    tone: 'critical',
    action: 'Considere reduzir o VC ou otimizar a PEEP.',
  },
};

export const DRIVING_PRESSURE: VentilationCalculation = {
  id: 'driving-pressure',
  name: 'Driving pressure (deltaP)',
  section: 'mecanica',
  aliases: ['driving pressure', 'deltap', 'pressão de distensão', 'dp', 'vili'],
  concept:
    'A driving pressure (pressão de distensão) é a pressão necessária para insuflar o pulmão acima da PEEP. Valores ≤ 15 cmH₂O estão associados a menor mortalidade em SDRA. É considerado o melhor preditor de desfecho em ventilação mecânica.',
  inputs: [plateauInput('ppausa', '25', HABITUAL), peepInput('peep', '10', HABITUAL)],
  checks: [plateauAbovePeep('ppausa', 'peep')],
  interpretation: DRIVING_PRESSURE_BANDS,
  citation: VENTILATION_REFERENCES.drivingPressure,
  compute(values) {
    // deltaP = Pplat − PEEP.
    const dp = requireValue(values, 'ppausa') - requireValue(values, 'peep');
    return banded(DRIVING_PRESSURE_BANDS, dp, formatDecimal(dp), 'deltaP', CMH2O);
  },
};

// ----- Troca gasosa -----

const PF_BANDS: Interpretation = {
  bands: [
    {
      id: 'sdra-grave',
      label: 'SDRA grave (P/F <100)',
      tone: 'critical',
      action: '',
      upTo: { value: 100, inclusive: true },
    },
    {
      id: 'sdra-moderada',
      label: 'SDRA moderada (P/F 100-199)',
      tone: 'attention',
      action: '',
      upTo: { value: 200, inclusive: true },
    },
    {
      id: 'sdra-leve',
      label: 'SDRA leve (P/F 200-300)',
      tone: 'attention',
      action: '',
      upTo: { value: 300, inclusive: true },
    },
  ],
  otherwise: { id: 'normal', label: 'Normal', tone: 'neutral', action: 'Sem critério para SDRA.' },
};

export const PF_RATIO: VentilationCalculation = {
  id: 'pf',
  name: 'Relação P/F (PaO₂/FiO₂)',
  section: 'troca',
  aliases: ['p/f', 'pf', 'pao2/fio2', 'oxigenação', 'sdra', 'ards', 'berlim'],
  concept:
    'A relação P/F é o principal índice de oxigenação, calculado pela PaO₂ (gasometria) dividida pela FiO₂ (fração de oxigênio). Valores normais são > 400. Valores < 300 indicam comprometimento da troca gasosa e classificam a gravidade da SDRA.',
  inputs: [
    {
      id: 'pao2',
      label: 'PaO₂',
      unit: 'mmHg',
      min: 10,
      max: 800,
      step: 1,
      placeholder: '80',
      usual: usual(30, 500, `${HABITUAL} (30-500 mmHg)`),
    },
    fio2Input('fio2', '40', true),
  ],
  interpretation: PF_BANDS,
  citation: VENTILATION_REFERENCES.sdra,
  compute(values) {
    const pf = requireValue(values, 'pao2') / fio2Fraction(values, 'fio2');
    return banded(PF_BANDS, pf, formatDecimal(pf, 0), 'P/F', '');
  },
};

/** Acima disso a S/F não vale (parte plana da curva de dissociação). */
export const SF_MAX_RELIABLE_SPO2 = 97;

const SF_BANDS: Interpretation = {
  bands: [
    {
      id: 'sdra-grave',
      label: 'SDRA grave (S/F <148)',
      tone: 'critical',
      action: '',
      upTo: { value: 148, inclusive: false },
    },
    {
      id: 'sdra-moderada',
      label: 'SDRA moderada (S/F 148-234)',
      tone: 'attention',
      action: '',
      upTo: { value: 235, inclusive: false },
    },
    {
      id: 'sdra-leve',
      label: 'SDRA leve (S/F 235-315)',
      tone: 'attention',
      action: '',
      upTo: { value: 315, inclusive: true },
    },
  ],
  otherwise: { id: 'normal', label: 'Normal', tone: 'neutral', action: 'Sem critério para SDRA.' },
};

function spo2Input(id: string, placeholder: string, warns: boolean): VentilationInput {
  return {
    id,
    label: 'SpO₂',
    unit: '%',
    min: 50,
    max: 100,
    step: 1,
    placeholder,
    ...(warns ? { usual: usual(70, 100, 'SpO₂ deve estar entre 70-100%') } : {}),
  };
}

export const SF_RATIO: VentilationCalculation = {
  id: 'sf',
  name: 'Relação S/F (SpO₂/FiO₂)',
  section: 'troca',
  aliases: ['s/f', 'sf', 'spo2/fio2', 'sem gasometria', 'sdra', 'ards'],
  concept:
    'A relação S/F é um substituto não invasivo da P/F, usando a saturação periférica (SpO₂) em vez da PaO₂. Só é válida com SpO₂ ≤ 97% (região íngreme da curva de dissociação). Útil quando não há gasometria disponível.',
  inputs: [spo2Input('spo2', '92', true), fio2Input('fio2', '40', true)],
  interpretation: SF_BANDS,
  citation: VENTILATION_REFERENCES.sdra,
  compute(values) {
    const spo2 = requireValue(values, 'spo2');
    if (spo2 > SF_MAX_RELIABLE_SPO2) {
      return {
        value: null,
        reading: reading('', 'SpO₂ > 97%', ''),
        details: ['Relação S/F não é confiável com SpO₂ > 97%'],
        band: null,
      };
    }
    const sf = spo2 / fio2Fraction(values, 'fio2');
    return banded(SF_BANDS, sf, formatDecimal(sf, 0), 'S/F', '');
  },
};

export const FIO2_ADJUSTMENT: VentilationCalculation = {
  id: 'ajuste-fio2',
  name: 'Ajuste de FiO₂',
  section: 'troca',
  aliases: ['fio2', 'nova fio2', 'pao2 alvo', 'oxigênio'],
  concept:
    'Estima a nova FiO₂ necessária para atingir uma PaO₂ alvo, assumindo que a relação P/F permanece constante. Útil para ajustar oxigênio com base na gasometria.',
  inputs: [
    {
      id: 'pao2Atual',
      label: 'PaO₂ atual',
      unit: 'mmHg',
      min: 10,
      max: 800,
      step: 1,
      placeholder: '60',
    },
    { ...fio2Input('fio2Atual', '40', false), label: 'FiO₂ atual' },
    {
      id: 'pao2Alvo',
      label: 'PaO₂ alvo',
      unit: 'mmHg',
      min: 10,
      max: 800,
      step: 1,
      placeholder: '80',
    },
  ],
  compute(values) {
    // FiO₂ nova = PaO₂ alvo × (FiO₂ atual ÷ PaO₂ atual), entre 0,21 e 1,0.
    const fio2 = Math.max(
      0.21,
      Math.min(
        1.0,
        requireValue(values, 'pao2Alvo') *
          (fio2Fraction(values, 'fio2Atual') / requireValue(values, 'pao2Atual')),
      ),
    );
    return {
      value: fio2,
      reading: reading('Nova FiO₂', formatDecimal(fio2, 2), ''),
      details: [`Equivalente a ${formatDecimal(fio2 * 100, 0)}%`],
      band: null,
    };
  },
};

export const RESPIRATORY_RATE_ADJUSTMENT: VentilationCalculation = {
  id: 'ajuste-fr',
  name: 'Ajuste de frequência respiratória',
  section: 'troca',
  aliases: ['frequência', 'fr', 'paco2 alvo', 'hipercapnia', 'ventilação alveolar'],
  concept:
    'Estima a nova frequência respiratória necessária para atingir uma PaCO₂ alvo, assumindo volume corrente constante. A ventilação alveolar é proporcional à frequência x volume corrente.',
  inputs: [
    respiratoryRateInput(
      'freqAtual',
      'Frequência atual',
      '16',
      usual(6, 40, `${HABITUAL} (6-40 ipm)`),
    ),
    {
      id: 'paco2Atual',
      label: 'PaCO₂ atual',
      unit: 'mmHg',
      min: 5,
      max: 200,
      step: 1,
      placeholder: '50',
      usual: usual(15, 120, `${HABITUAL} (15-120 mmHg)`),
    },
    {
      id: 'paco2Alvo',
      label: 'PaCO₂ alvo',
      unit: 'mmHg',
      min: 5,
      max: 200,
      step: 1,
      placeholder: '40',
    },
  ],
  compute(values) {
    // FR nova = FR atual × (PaCO₂ atual ÷ PaCO₂ alvo).
    const freq =
      requireValue(values, 'freqAtual') *
      (requireValue(values, 'paco2Atual') / requireValue(values, 'paco2Alvo'));
    return {
      value: freq,
      reading: reading('Nova frequência', formatDecimal(freq, 0), 'ipm'),
      details: ['Ajuste sugerido mantendo VC constante'],
      band: null,
    };
  },
};

// ----- Desmame -----

const TOBIN_BANDS: Interpretation = {
  bands: [
    {
      id: 'favoravel',
      label: 'Favorável ao desmame',
      tone: 'neutral',
      action: '',
      upTo: { value: 80, inclusive: false },
    },
    {
      id: 'zona-cinzenta',
      label: 'Zona cinzenta',
      tone: 'attention',
      action: 'Considere avaliar outros fatores.',
      upTo: { value: 105, inclusive: true },
    },
  ],
  otherwise: {
    id: 'desfavoravel',
    label: 'Desfavorável',
    tone: 'critical',
    action: 'Risco de falha de extubação.',
  },
};

export const TOBIN_INDEX: VentilationCalculation = {
  id: 'tobin',
  name: 'Índice de Tobin (IRRS)',
  section: 'desmame',
  aliases: ['tobin', 'irrs', 'f/vt', 'respiração rápida e superficial', 'desmame', 'extubação'],
  concept:
    'O índice de Tobin (f/VT) avalia a tolerância ao desmame. Valores < 105 sugerem boa reserva ventilatória e probabilidade de extubação bem-sucedida. Valores > 105 indicam respiração rápida e superficial, sugerindo maior risco de falha.',
  inputs: [
    respiratoryRateInput('freq', 'Frequência respiratória', '20', usual(6, 40, HABITUAL)),
    {
      id: 've',
      label: 'Volume minuto',
      unit: 'L/min',
      min: 0.5,
      max: 50,
      step: 0.1,
      placeholder: '8',
      usual: usual(2, 25, `${HABITUAL} (2-25 L/min)`),
    },
  ],
  interpretation: TOBIN_BANDS,
  note: {
    title: 'Outros parâmetros de desmame:',
    items: [
      'PImax: idealmente ≤ -25 cmH₂O (mais negativo = melhor)',
      'P0.1: idealmente < 3,5 cmH₂O (drive ventilatório)',
    ],
  },
  citation: VENTILATION_REFERENCES.tobin,
  compute(values) {
    // VC = VE ÷ f; Tobin = f ÷ VC (em litros).
    const freq = requireValue(values, 'freq');
    const vcL = requireValue(values, 've') / freq;
    const tobin = freq / vcL;
    const vcMl = vcL * 1000;
    return banded(TOBIN_BANDS, tobin, formatDecimal(tobin, 0), 'Tobin (f/VT)', 'rpm/L', [
      `VC calculado: ${formatDecimal(vcMl, 0)} mL`,
    ]);
  },
};

const ROX_BANDS: Interpretation = {
  bands: [
    {
      id: 'alto-risco',
      label: 'Alto risco de falha',
      tone: 'critical',
      action: 'Considere intubação.',
      upTo: { value: 3.85, inclusive: false },
    },
    {
      id: 'risco-intermediario',
      label: 'Risco intermediário',
      tone: 'attention',
      action: 'Considere reavaliar em 2 h.',
      upTo: { value: 4.88, inclusive: false },
    },
  ],
  otherwise: {
    id: 'baixo-risco',
    label: 'Baixo risco de falha de CNAF',
    tone: 'neutral',
    action: '',
  },
};

export const ROX_INDEX: VentilationCalculation = {
  id: 'rox',
  name: 'Índice ROX',
  section: 'desmame',
  aliases: ['rox', 'cnaf', 'cateter nasal de alto fluxo', 'alto fluxo', 'hfnc'],
  concept:
    'O índice ROX prediz falha de cateter nasal de alto fluxo (CNAF). Combina a relação S/F com a frequência respiratória. Valores ≥ 4,88 em 2-12h indicam menor risco de intubação. Valores < 3,85 sugerem alto risco de falha.',
  inputs: [
    spo2Input('spo2', '94', false),
    fio2Input('fio2', '50', false),
    respiratoryRateInput('freq', 'Frequência respiratória', '22'),
  ],
  interpretation: ROX_BANDS,
  related: {
    toolId: 'via-aerea',
    label: 'Abrir Intubação e via aérea difícil',
    bandIds: ['alto-risco'],
  },
  citation: VENTILATION_REFERENCES.rox,
  compute(values) {
    // Conta do ANY sem mudança: a FiO₂ em fração vira porcentagem antes de
    // dividir. É o achado 1.1 da revisão clínica (o ROX original usa fração).
    const fio2 = fio2Fraction(values, 'fio2');
    const fio2Pct = fio2 <= 1 ? fio2 * 100 : fio2;
    const rox = requireValue(values, 'spo2') / fio2Pct / requireValue(values, 'freq');
    return banded(ROX_BANDS, rox, formatDecimal(rox, 2), 'ROX', '');
  },
};

// ----- Outros parâmetros -----

export const TIME_CONSTANT: VentilationCalculation = {
  id: 'tau',
  name: 'Constante de tempo (tau)',
  section: 'outros',
  aliases: ['tau', 'constante de tempo', 'auto-peep', 'aprisionamento aéreo', 'tempo expiratório'],
  concept:
    'A constante de tempo (tau) representa o tempo necessário para esvaziar 63% do volume pulmonar. É o produto da resistência pela complacência. O tempo expiratório deve ser 4-5 tau para evitar auto-PEEP (air trapping).',
  inputs: [
    {
      id: 'rva',
      label: 'Resistência',
      unit: 'cmH₂O/L/s',
      min: 0.1,
      max: 100,
      step: 0.1,
      placeholder: '10',
    },
    {
      id: 'cst',
      label: 'Complacência',
      unit: 'mL/cmH₂O',
      min: 1,
      max: 200,
      step: 1,
      placeholder: '50',
    },
  ],
  compute(values) {
    // tau = R × C, com a complacência em L/cmH₂O.
    const cstL = requireValue(values, 'cst') / 1000;
    const tau = requireValue(values, 'rva') * cstL;
    return {
      value: tau,
      reading: reading('tau', formatDecimal(tau, 2), 'segundos'),
      details: [
        'Tempo expiratório recomendado:',
        `4tau = ${formatDecimal(4 * tau, 2)} s | 5tau = ${formatDecimal(5 * tau, 2)} s`,
      ],
      band: null,
    };
  },
};

const PMUS_BANDS: Interpretation = {
  bands: [
    {
      id: 'esforco-baixo',
      label: 'Esforço baixo',
      tone: 'attention',
      action: 'Possível oversupport.',
      upTo: { value: 5, inclusive: false },
    },
    {
      id: 'esforco-adequado',
      label: 'Esforço adequado (5-10 cmH₂O)',
      tone: 'neutral',
      action: '',
      upTo: { value: 10, inclusive: true },
    },
    {
      id: 'esforco-moderadamente-alto',
      label: 'Esforço moderadamente alto',
      tone: 'attention',
      action: '',
      upTo: { value: 13, inclusive: true },
    },
  ],
  otherwise: {
    id: 'esforco-excessivo',
    label: 'Esforço excessivo',
    tone: 'critical',
    action: 'Risco de P-SILI.',
  },
};

export const MUSCLE_PRESSURE: VentilationCalculation = {
  id: 'pmus',
  name: 'Pressão muscular estimada (Pmus)',
  section: 'outros',
  aliases: ['pmus', 'esforço', 'oclusão', 'pocc', 'p-sili'],
  concept:
    'A Pmus estimada reflete o esforço muscular do paciente durante ventilação assistida. É derivada da manobra de oclusão (deltaPocc). Valores entre 5-10 cmH₂O indicam esforço adequado. Valores baixos sugerem hipoventilação; altos indicam excesso de esforço.',
  inputs: [
    {
      id: 'deltaPocc',
      label: 'deltaPocc (deflexão na oclusão)',
      unit: CMH2O,
      min: -60,
      max: 0,
      step: 0.5,
      placeholder: '-10',
    },
  ],
  interpretation: PMUS_BANDS,
  citation: VENTILATION_REFERENCES.pmus,
  compute(values) {
    // Pmus = −0,75 × deltaPocc.
    const pmus = -0.75 * requireValue(values, 'deltaPocc');
    return banded(PMUS_BANDS, pmus, formatDecimal(pmus), 'Pmus estimada', CMH2O);
  },
};

const MECHANICAL_POWER_BANDS: Interpretation = {
  bands: [
    {
      id: 'baixa',
      label: 'Baixa intensidade',
      tone: 'neutral',
      action: 'Menor risco de VILI.',
      upTo: { value: 12, inclusive: false },
    },
    {
      id: 'moderada',
      label: 'Moderada',
      tone: 'attention',
      action: 'Considere monitorar.',
      upTo: { value: 17, inclusive: true },
    },
  ],
  otherwise: {
    id: 'elevada',
    label: 'Elevada',
    tone: 'critical',
    action: 'Maior risco de mortalidade.',
  },
};

export const MECHANICAL_POWER: VentilationCalculation = {
  id: 'potencia-mecanica',
  name: 'Potência mecânica (mechanical power)',
  section: 'outros',
  aliases: ['mechanical power', 'potência mecânica', 'mp', 'energia', 'vili'],
  concept:
    'O mechanical power é a energia total transferida ao sistema respiratório por minuto, integrando VC, driving pressure e frequência. Valores > 17 J/min estão associados a maior mortalidade. É um marcador de intensidade da ventilação e potencial lesão pulmonar.',
  inputs: [
    tidalVolumeInput('vc', HABITUAL),
    {
      id: 'dp',
      label: 'Driving pressure',
      unit: CMH2O,
      min: 1,
      max: 60,
      step: 1,
      placeholder: '15',
    },
    respiratoryRateInput('freq', 'Frequência respiratória', '20'),
  ],
  interpretation: MECHANICAL_POWER_BANDS,
  citation: VENTILATION_REFERENCES.mechanicalPower,
  compute(values) {
    // Fórmula simplificada do ANY: MP = 0,098 × VC (L) × deltaP × FR.
    const mp =
      0.098 *
      (requireValue(values, 'vc') / 1000) *
      requireValue(values, 'dp') *
      requireValue(values, 'freq');
    return banded(MECHANICAL_POWER_BANDS, mp, formatDecimal(mp), 'MP', 'J/min');
  },
};

const ASYNCHRONY_BANDS: Interpretation = {
  bands: [
    {
      id: 'baixo',
      label: 'Baixo',
      tone: 'neutral',
      action: 'Boa sincronia.',
      upTo: { value: 5, inclusive: false },
    },
    {
      id: 'moderado',
      label: 'Moderado',
      tone: 'attention',
      action: 'Considere otimizar os ajustes.',
      upTo: { value: 10, inclusive: true },
    },
  ],
  otherwise: {
    id: 'elevado',
    label: 'Elevado (>10%)',
    tone: 'critical',
    action: 'Associado a pior prognóstico.',
  },
};

export const ASYNCHRONY_INDEX: VentilationCalculation = {
  id: 'assincronia',
  name: 'Índice de assincronia',
  section: 'outros',
  aliases: ['assincronia', 'ia', 'duplo disparo', 'auto-trigger', 'esforço ineficaz'],
  concept:
    'O índice de assincronia quantifica a proporção de ciclos com assincronia paciente-ventilador (duplo disparo, auto-trigger, etc). Valores > 10% estão associados a maior tempo de VM e pior prognóstico.',
  inputs: [
    {
      id: 'eventos',
      label: 'Eventos de assincronia',
      unit: 'eventos',
      min: 0,
      max: 1000,
      step: 1,
      placeholder: '5',
    },
    {
      id: 'freqTotal',
      label: 'Frequência total (ciclos do ventilador + triggers)',
      unit: 'ciclos',
      min: 1,
      max: 1000,
      step: 1,
      placeholder: '20',
    },
  ],
  checks: [
    {
      id: 'eventos-ate-o-total',
      fields: ['eventos', 'freqTotal'],
      message: 'Os eventos de assincronia não podem passar da frequência total.',
      holds: (values) => requireValue(values, 'eventos') <= requireValue(values, 'freqTotal'),
    },
  ],
  interpretation: ASYNCHRONY_BANDS,
  citation: VENTILATION_REFERENCES.asynchrony,
  compute(values) {
    const ia = (requireValue(values, 'eventos') / requireValue(values, 'freqTotal')) * 100;
    return banded(ASYNCHRONY_BANDS, ia, formatDecimal(ia), 'IA', '%');
  },
};

/** As 14 contas, na ordem do VM Guide. */
export const VENTILATION_CALCULATIONS: readonly VentilationCalculation[] = [
  PREDICTED_BODY_WEIGHT,
  AIRWAY_RESISTANCE,
  STATIC_COMPLIANCE,
  DRIVING_PRESSURE,
  PF_RATIO,
  SF_RATIO,
  FIO2_ADJUSTMENT,
  RESPIRATORY_RATE_ADJUSTMENT,
  TOBIN_INDEX,
  ROX_INDEX,
  TIME_CONSTANT,
  MUSCLE_PRESSURE,
  MECHANICAL_POWER,
  ASYNCHRONY_INDEX,
];
