import type { BolusDrug, DoseLeg, PerKgDose, VolumeRule } from './bolus';

/**
 * As 65 drogas em bolus do PedGuide v4 (CC-319), na ordem e com os textos do
 * ANY. Doses, tetos, concentrações e instruções são os do ANY, sem mudança
 * clínica: o teste diferencial confere cada uma contra a referência congelada.
 * As divergências com o HETRIN e o §17 estão na reconciliação da fonte única
 * (CC-321), que o Dr. Gustavo Moreira assina; o que pareceu errado está em
 * docs/ferramentas/revisao-clinica/pediatria.md.
 */

/** Atalho da forma mais comum: uma dose por kg, teto e volume = dose ÷ concentração. */
function single(
  leg: DoseLeg,
  unit: string,
  doseDecimals: number,
  volume: VolumeRule,
  extra: Partial<Pick<PerKgDose, 'note'>> = {},
): PerKgDose {
  return { kind: 'por-kg', legs: [leg], unit, doseDecimals, volume, ...extra };
}

function conc(perMl: number, decimals: number, round?: 'para-cima'): VolumeRule {
  return round
    ? { kind: 'concentracao', perMl, decimals, round }
    : { kind: 'concentracao', perMl, decimals };
}

const NO_VOLUME: VolumeRule = { kind: 'sem-volume' };

// ==========================================
// PCR
// ==========================================

const PCR: readonly BolusDrug[] = [
  {
    id: 'epinefrina-iv',
    name: 'EPINEFRINA IV/IO',
    presentation: '0,1 mg/mL — solução final (antiga 1:10.000)',
    doseLabel: '0,01 mg/kg',
    highlight: true,
    instruction:
      'Volume: 0,1 mL/kg da solução final. Max: 1 mg. Repetir a cada 3-5 min. NUNCA administrar 1 mg/mL por via IV/IO.',
    preparation: 'epinefrina',
    dose: single({ perKg: 0.01, cap: 1 }, 'mg', 2, conc(0.1, 1), {
      note: { kind: 'texto', text: 'da solução 0,1 mg/mL' },
    }),
  },
  {
    id: 'amiodarona',
    name: 'AMIODARONA',
    presentation: '50 mg/mL',
    doseLabel: '5 mg/kg',
    instruction: 'FV/TV sem pulso refratária. Max: 300 mg. Pode repetir até 15 mg/kg.',
    dose: single({ perKg: 5, cap: 300 }, 'mg', 0, conc(50, 1)),
  },
  {
    id: 'bicarbonato',
    name: 'BICARBONATO DE SÓDIO 8,4%',
    presentation: '1 mEq/mL',
    doseLabel: '1 mEq/kg',
    notRoutine: true,
    instruction:
      'Não usar rotineiramente na PCR. Considerar em hipercalemia, intoxicação por bloqueador de canal de sódio ou indicação específica. Administrar lentamente; não misturar com cálcio.',
    dose: single({ perKg: 1, cap: 250 }, 'mEq', 0, conc(1, 0), {
      note: { kind: 'texto', text: '+ igual vol. AD' },
    }),
  },
  {
    id: 'atropina',
    name: 'ATROPINA',
    presentation: '0,5 mg/mL',
    doseLabel: '0,02 mg/kg',
    instruction: 'Bradicardia com pulso. Max: 1 mg.',
    dose: single({ perKg: 0.02, cap: 1 }, 'mg', 2, conc(0.5, 2)),
  },
  {
    id: 'calcio',
    name: 'GLUCONATO DE CÁLCIO 10%',
    presentation: '100 mg/mL',
    doseLabel: '60-100 mg/kg',
    calculatedAt: '60 mg/kg (piso da faixa)',
    notRoutine: true,
    instruction:
      'Não usar rotineiramente na PCR. Indicações: hipocalcemia, hipercalemia ou intoxicação por bloqueador de canal de cálcio. Max: 2000 mg. Infundir lentamente com ECG.',
    dose: single({ perKg: 60, cap: 2000 }, 'mg', 0, conc(100, 1)),
  },
  {
    id: 'cloreto-calcio',
    name: 'CLORETO DE CÁLCIO 10%',
    presentation: '100 mg/mL',
    doseLabel: '20 mg/kg',
    notRoutine: true,
    instruction:
      'Mesmas indicações específicas do cálcio. Max: 1000 mg. Preferir acesso central ou intraósseo; risco de necrose por extravasamento. Não misturar com bicarbonato.',
    dose: single({ perKg: 20, cap: 1000 }, 'mg', 0, conc(100, 1)),
  },
  {
    id: 'lidocaina',
    name: 'LIDOCAÍNA 1%',
    presentation: '10 mg/mL',
    doseLabel: '1 mg/kg',
    instruction: 'FV/TV sem pulso (alternativa). Max: 100 mg. EV bolus rápido.',
    dose: single({ perKg: 1, cap: 100 }, 'mg', 0, conc(10, 1)),
  },
  {
    id: 'insulina-hiperk',
    name: 'INSULINA REGULAR (Hipercalemia)',
    presentation: '100 UI/mL',
    doseLabel: '0,1 UI/kg',
    instruction: 'Hipercalemia. Max: 10 UI. EV bolus rápido, sempre com glicose associada.',
    dose: single({ perKg: 0.1, cap: 10 }, 'UI', 1, NO_VOLUME, {
      note: { kind: 'texto', text: 'em seringa de insulina, com glicose associada' },
    }),
  },
  {
    id: 'magnesio-pcr',
    name: 'SULFATO DE MAGNÉSIO 10%',
    presentation: '100 mg/mL',
    doseLabel: '50 mg/kg',
    instruction: 'Torsades de pointes / hipomagnesemia. Max: 2000 mg. EV bolus na PCR.',
    dose: single({ perKg: 50, cap: 2000 }, 'mg', 0, conc(100, 1)),
  },
  {
    id: 'glicose-g10',
    name: 'GLICOSE 10%',
    presentation: '100 mg/mL',
    doseLabel: '0,5 g/kg',
    instruction:
      'Hipoglicemia: 5 mL/kg EV/IO, com reavaliação da glicemia. Evitar G50% sem diluição em crianças. Ajustar repetição à resposta clínica.',
    dose: single(
      { perKg: 0.5 },
      'g',
      1,
      { kind: 'por-kg', mlPerKg: 5, decimals: 0 },
      {
        note: { kind: 'texto', text: '5 mL/kg EV/IO' },
      },
    ),
  },
  {
    id: 'glicose-g25',
    name: 'GLICOSE 25%',
    presentation: '250 mg/mL',
    doseLabel: '0,5 g/kg',
    instruction:
      'Alternativa em criança maior com acesso adequado: 2 mL/kg EV/IO. Preferir G10% em lactentes e acessos periféricos pequenos.',
    dose: single(
      { perKg: 0.5 },
      'g',
      1,
      { kind: 'por-kg', mlPerKg: 2, decimals: 0 },
      {
        note: { kind: 'texto', text: '2 mL/kg EV/IO' },
      },
    ),
  },
];

// ==========================================
// INTUBAÇÃO (ISR)
// ==========================================

const IOT: readonly BolusDrug[] = [
  {
    id: 'cetamina',
    name: 'CETAMINA',
    presentation: '50 mg/mL',
    doseLabel: '1-2 mg/kg',
    calculatedAt: '2 mg/kg (topo da faixa)',
    instruction:
      'Indução dissociativa e broncodilatação. Pode preservar ventilação espontânea sem BNM; após bloqueio neuromuscular, o paciente estará apneico.',
    dose: single({ perKg: 2, cap: 100 }, 'mg', 0, conc(50, 2)),
  },
  {
    id: 'midazolam',
    name: 'MIDAZOLAM',
    presentation: '5 mg/mL',
    doseLabel: '0,1-0,3 mg/kg',
    calculatedAt: '0,3 mg/kg',
    instruction:
      'Alternativa de indução; início menos previsível em choque. Max: 10 mg. Pode causar hipotensão.',
    dose: single({ perKg: 0.3, cap: 10 }, 'mg', 1, conc(5, 2)),
  },
  {
    id: 'fentanil',
    name: 'FENTANIL',
    presentation: '50 mcg/mL',
    doseLabel: '1-2 mcg/kg',
    calculatedAt: '2 mcg/kg (topo da faixa)',
    instruction: 'Analgesia. Administrar lento. Max: 100 mcg.',
    dose: single({ perKg: 2, cap: 100 }, 'mcg', 0, conc(50, 2)),
  },
  {
    id: 'propofol',
    name: 'PROPOFOL',
    presentation: '10 mg/mL',
    doseLabel: '1-2,5 mg/kg',
    calculatedAt: '2,5 mg/kg (topo da faixa)',
    instruction: 'Indução. Hipotensão dose-dependente. Evitar em choque.',
    dose: single({ perKg: 2.5, cap: 200 }, 'mg', 0, conc(10, 1)),
  },
  {
    id: 'etomidato',
    name: 'ETOMIDATO',
    presentation: '2 mg/mL',
    doseLabel: '0,2-0,4 mg/kg',
    calculatedAt: '0,3 mg/kg',
    instruction: 'Indução. Estabilidade hemodinâmica. Max: 20 mg. Evitar em sepse.',
    dose: single({ perKg: 0.3, cap: 20 }, 'mg', 1, conc(2, 1)),
  },
  {
    id: 'rocuronio',
    name: 'ROCURÔNIO',
    presentation: '10 mg/mL',
    doseLabel: '1,2 mg/kg',
    instruction:
      'BNM de escolha quando se deseja início rápido. Max: 100 mg. Paralisia prolongada: garantir sedação pós-intubação. Sugamadex somente conforme disponibilidade e protocolo; não substitui plano de resgate.',
    dose: single({ perKg: 1.2, cap: 100 }, 'mg', 0, conc(10, 1)),
  },
  {
    id: 'succinil',
    name: 'SUCCINILCOLINA',
    presentation: '10 mg/mL',
    doseLabel: '1-2 mg/kg',
    calculatedAt: '1,5 mg/kg',
    instruction:
      'Evitar em hipercalemia, queimadura após 24 h, denervação ou doença neuromuscular, rabdomiólise e risco de hipertermia maligna. Max: 100 mg. Ampola de 100 mg reconstituída para 10 mL.',
    dose: single({ perKg: 1.5, cap: 100 }, 'mg', 0, conc(10, 1)),
  },
  {
    id: 'cisatracurio',
    name: 'CISATRACÚRIO',
    presentation: '2 mg/mL',
    doseLabel: '0,1-0,15 mg/kg',
    calculatedAt: '0,15 mg/kg (topo da faixa)',
    instruction:
      'Início mais lento; não é primeira escolha para SRI. Reservar para situações selecionadas quando rocurônio e succinilcolina forem inadequados. Metabolismo de Hofmann.',
    dose: single({ perKg: 0.15 }, 'mg', 2, conc(2, 2)),
  },
];

// ==========================================
// OUTRAS DROGAS DE EMERGÊNCIA
// ==========================================

const EMERGENCY: readonly BolusDrug[] = [
  {
    id: 'epinefrina-im',
    name: 'EPINEFRINA IM (Anafilaxia)',
    presentation: '1 mg/mL - SEM DILUIR',
    doseLabel: '0,01 mg/kg',
    highlight: true,
    instruction:
      'Via INTRAMUSCULAR - Vasto lateral da coxa. Max: 0,5 mg. Repetir a cada 5-15 min conforme resposta.',
    dose: single({ perKg: 0.01, cap: 0.5 }, 'mg', 2, conc(1, 2)),
  },
  {
    id: 'adenosina',
    name: 'ADENOSINA',
    presentation: '3 mg/mL',
    doseLabel: '0,1 - 0,2 mg/kg',
    instruction: 'TSV com pulso. Bolus RÁPIDO + flush 5-10 mL SF. Max: 6/12 mg.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 0.1, cap: 6, label: '1ª dose' },
        { perKg: 0.2, cap: 12, label: '2ª dose' },
      ],
      join: ' / ',
      unit: 'mg',
      doseDecimals: 1,
      volume: conc(3, 2),
    },
  },
  {
    id: 'glicose',
    name: 'GLICOSE 10%',
    presentation: '100 mg/mL',
    doseLabel: '0,5 g/kg',
    instruction:
      'Hipoglicemia: 5 mL/kg EV/IO e reavaliar glicemia. Evitar G50% sem diluição em crianças.',
    dose: single(
      { perKg: 0.5 },
      'g',
      1,
      { kind: 'por-kg', mlPerKg: 5, decimals: 0 },
      {
        note: { kind: 'texto', text: '5 mL/kg EV/IO' },
      },
    ),
  },
  {
    id: 'naloxona',
    name: 'NALOXONA',
    presentation: '0,4 mg/mL',
    doseLabel: '0,1 mg/kg',
    instruction: 'Reversão de opioides. Via: IV, IO, IM, IN. Max: 2 mg.',
    dose: single({ perKg: 0.1, cap: 2 }, 'mg', 2, conc(0.4, 1)),
  },
  {
    id: 'tranexamico',
    name: 'ÁCIDO TRANEXÂMICO',
    presentation: '50 mg/mL',
    doseLabel: '15 mg/kg',
    instruction: 'Trauma com hemorragia. Bolus em 10 min. Max: 1000 mg.',
    dose: single({ perKg: 15, cap: 1000 }, 'mg', 0, conc(50, 1)),
  },
  {
    id: 'hidrocortisona',
    name: 'HIDROCORTISONA',
    presentation: '100 mg/2mL',
    doseLabel: '2-4 mg/kg',
    calculatedAt: '4 mg/kg (topo da faixa)',
    notRoutine: true,
    instruction:
      'Não usar rotineiramente na anafilaxia. Considerar em asma associada ou reação refratária, após epinefrina e ressuscitação inicial. Max: 200 mg.',
    dose: single({ perKg: 4, cap: 200 }, 'mg', 0, conc(50, 1)),
  },
  {
    id: 'difenidramina',
    name: 'DIFENIDRAMINA',
    presentation: '50 mg/mL',
    doseLabel: '1-1,25 mg/kg',
    calculatedAt: '1,25 mg/kg (topo da faixa)',
    notRoutine: true,
    instruction:
      'Não usar rotineiramente. Se excepcionalmente indicada para sintomas cutâneos após estabilização, administrar EV lentamente ou IM. Max: 50 mg; pode causar sedação e hipotensão.',
    dose: single({ perKg: 1.25, cap: 50 }, 'mg', 0, conc(50, 1)),
  },
  {
    id: 'salbutamol-anaf',
    name: 'SALBUTAMOL MDI',
    presentation: '100 mcg/jato',
    doseLabel: '4-10 jatos',
    instruction:
      'Adjuvante no broncoespasmo após epinefrina; administrar com espaçador e repetir conforme resposta. Não trata choque ou edema de via aérea.',
    dose: { kind: 'fixa', dose: '4 - 10', unit: 'jatos', note: 'jatos com espaçador' },
  },
  {
    id: 'octreotide-hda',
    name: 'OCTREOTIDE (HDA)',
    presentation: '0,1 mg/mL',
    doseLabel: '1-2 mcg/kg',
    instruction:
      'Hemorragia digestiva alta. Bolus max: 50 mcg. Infusão: 1-2 mcg/kg/h (diluir 100 mcg em 50 mL SF, correr peso/2 a peso mL/h, max 25-50 mcg/h).',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 1, cap: 50 },
        { perKg: 2, cap: 50 },
      ],
      join: ' / ',
      unit: 'mcg',
      doseDecimals: 0,
      volume: conc(100, 2),
      note: { kind: 'texto', text: 'EV bolus' },
    },
  },
  {
    id: 'omeprazol-hda',
    name: 'OMEPRAZOL (HDA)',
    presentation: '4 mg/mL (amp. 40 mg + 10 mL diluente)',
    doseLabel: '1 mg/kg',
    instruction: 'Hemorragia digestiva alta. Max: 40 mg. EV em bolus.',
    dose: single({ perKg: 1, cap: 40 }, 'mg', 0, conc(4, 1)),
  },
];

// ==========================================
// ANTICONVULSIVANTES
// ==========================================

const ANTICONVULSANTS: readonly BolusDrug[] = [
  {
    id: 'diazepam',
    name: 'DIAZEPAM',
    presentation: '5 mg/mL',
    doseLabel: '0,3 mg/kg',
    instruction: 'Status epilepticus - 1ª linha. EV em bolus, não diluir. Max: 5 mg.',
    dose: single({ perKg: 0.3, cap: 5 }, 'mg', 1, conc(5, 2)),
  },
  {
    id: 'midazolam-conv',
    name: 'MIDAZOLAM (Status)',
    presentation: '5 mg/mL',
    doseLabel: '0,3 IM · 0,1 EV mg/kg',
    instruction:
      'Status epilepticus - Alternativa. IM: 0,3 mg/kg (max 10 mg). EV: 0,1 mg/kg (max 5 mg).',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 0.3, cap: 10, label: 'IM' },
        { perKg: 0.1, cap: 5, label: 'EV' },
      ],
      join: ' / ',
      unit: 'mg',
      doseDecimals: 1,
      volume: conc(5, 2),
      note: { kind: 'texto', text: 'IM / EV' },
    },
  },
  {
    id: 'fenitoina',
    name: 'FENITOINA',
    presentation: '50 mg/mL',
    doseLabel: '20 mg/kg',
    instruction:
      'Status epilepticus - 2ª linha. Max: 1500 mg. Diluir em SF, infundir em 20 min. Monitorizar ECG.',
    dose: single({ perKg: 20, cap: 1500 }, 'mg', 0, conc(50, 1)),
  },
  {
    id: 'fenobarbital',
    name: 'FENOBARBITAL',
    presentation: '100 mg/mL',
    doseLabel: '20 mg/kg',
    instruction:
      'Status refratário / Neonatal. Max: 1000 mg. Diluir em SF, infundir em 15-20 min. Risco depressão respiratória.',
    dose: single({ perKg: 20, cap: 1000 }, 'mg', 0, conc(100, 1)),
  },
  {
    id: 'levetiracetam',
    name: 'LEVETIRACETAM',
    presentation: '100 mg/mL',
    doseLabel: '40-60 mg/kg',
    calculatedAt: '60 mg/kg (topo da faixa)',
    instruction: 'Status epilepticus - Alternativa 2ª linha. Infundir em 15 min. Max: 3000 mg.',
    dose: single({ perKg: 60, cap: 3000 }, 'mg', 0, conc(100, 1)),
  },
];

// ==========================================
// NEUROPROTEÇÃO E OSMOTERAPIA
// ==========================================

const NEURO: readonly BolusDrug[] = [
  {
    id: 'manitol',
    name: 'MANITOL 20%',
    presentation: '200 mg/mL',
    doseLabel: '0,25-1 g/kg',
    calculatedAt: '0,5 g/kg',
    instruction: 'Hipertensão intracraniana. Infundir em 15-30 min.',
    // 0,5 g/kg a 0,2 g/mL = 2,5 mL/kg. O ANY faz peso × 0,5 × 5; peso × 0,5 é
    // exato em ponto flutuante, então peso × 2,5 dá o mesmo número.
    dose: single({ perKg: 0.5 }, 'g', 1, { kind: 'por-kg', mlPerKg: 2.5, decimals: 0 }),
  },
  {
    id: 'nacl',
    name: 'NaCl 3% (Salina Hipertônica)',
    presentation: '0,513 mEq Na/mL',
    doseLabel: '2-5 mL/kg',
    calculatedAt: '3 mL/kg',
    instruction: 'HIC, hiponatremia grave. Infundir em 10-20 min.',
    preparation: 'nacl3',
    dose: {
      kind: 'volume-por-kg',
      mlPerKg: 3,
      concentration: 0.513,
      unit: 'mEq',
      doseDecimals: 1,
      volumeDecimals: 0,
    },
  },
];

// ==========================================
// DOR E SEDAÇÃO PARA PROCEDIMENTOS
// ==========================================

const PAIN: readonly BolusDrug[] = [
  {
    id: 'cetamina-dor',
    name: 'CETAMINA',
    presentation: '50 mg/mL',
    doseLabel: '1 EV · 4 IM mg/kg',
    instruction:
      'Sedação dissociativa para procedimentos. Max: 100 mg EV / 200 mg IM. Bolus lento. Evitar abaixo de 3 meses.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 1, cap: 100, label: 'EV' },
        { perKg: 4, cap: 200, label: 'IM' },
      ],
      join: ' / ',
      unit: 'mg',
      doseDecimals: 0,
      volume: conc(50, 2),
      note: { kind: 'texto', text: 'EV / IM' },
    },
  },
  {
    id: 'fentanil-dor',
    name: 'FENTANIL',
    presentation: '50 mcg/mL',
    doseLabel: '1 EV · 1,5 IN mcg/kg',
    instruction: 'Analgesia. Max: 100 mcg. EV em bolus lento ou intranasal.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 1, cap: 100, label: 'EV' },
        { perKg: 1.5, cap: 100, label: 'IN' },
      ],
      join: ' / ',
      unit: 'mcg',
      doseDecimals: 0,
      volume: conc(50, 2),
      note: { kind: 'texto', text: 'EV / IN' },
    },
  },
  {
    id: 'midazolam-dor',
    name: 'MIDAZOLAM',
    presentation: '5 mg/mL',
    doseLabel: '0,1 EV · 0,4 IN mg/kg',
    instruction:
      'Ansiólise/sedação leve. Max: 5 mg EV / 10 mg IN. IN: se acima de 1 mL, dividir entre as narinas.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 0.1, cap: 5, label: 'EV' },
        { perKg: 0.4, cap: 10, label: 'IN' },
      ],
      join: ' / ',
      unit: 'mg',
      doseDecimals: 1,
      volume: conc(5, 2),
      note: { kind: 'texto', text: 'EV / IN' },
    },
  },
  {
    id: 'morfina-dor',
    name: 'MORFINA',
    presentation: '10 mg/mL',
    doseLabel: '0,1 mg/kg',
    instruction: 'Analgesia de dor intensa. Max: 5 mg. EV em bolus lento.',
    dose: single({ perKg: 0.1, cap: 5 }, 'mg', 1, conc(10, 2)),
  },
  {
    id: 'propofol-dor',
    name: 'PROPOFOL',
    presentation: '10 mg/mL',
    doseLabel: '1 mg/kg',
    instruction:
      'Sedação para procedimentos curtos. Max: 100 mg. EV lento, considerar doses fracionadas.',
    dose: single({ perKg: 1, cap: 100 }, 'mg', 0, conc(10, 1)),
  },
];

// ==========================================
// CRISE ASMÁTICA E BRONCOESPASMO
// ==========================================

const RESPIRATORY: readonly BolusDrug[] = [
  {
    id: 'salbutamol-resp',
    name: 'SALBUTAMOL MDI',
    presentation: '100 mcg/jato',
    doseLabel: '4-10 jatos',
    instruction:
      'Leve/moderada: 4-6 jatos; grave: 6-10 jatos, sempre com espaçador. Repetir a cada 20-30 min, até 3 ciclos, conforme resposta.',
    dose: { kind: 'fixa', dose: '4 - 10', unit: 'jatos', note: 'jatos com espaçador' },
  },
  {
    id: 'ipratropio-mdi',
    name: 'IPRATRÓPIO MDI',
    presentation: '20 mcg/jato',
    doseLabel: '80 mcg (4 jatos)',
    instruction:
      'Associar ao salbutamol na crise grave; repetir com cada ciclo, até 3 administrações.',
    dose: { kind: 'fixa', dose: '4', unit: 'jatos', note: 'jatos com espaçador' },
  },
  {
    id: 'ipratropio-gotas',
    name: 'IPRATRÓPIO — nebulização',
    presentation: '0,25 mg/mL',
    doseLabel: '0,25-0,5 mg',
    instruction: 'Alternativa ao MDI. Repetir a cada 20-30 min, até 3 ciclos, na crise grave.',
    dose: {
      kind: 'degrau-de-peso',
      belowKg: 20,
      lower: { dose: 0.25, note: 'menos de 20 kg — em nebulização' },
      upper: { dose: 0.5, note: '20 kg ou mais — em nebulização' },
      unit: 'mg',
      doseDecimals: 2,
      volume: { kind: 'concentracao', perMl: 0.25, decimals: 0 },
    },
  },
  {
    id: 'prednisolona',
    name: 'PREDNISOLONA',
    presentation: '3 mg/mL',
    doseLabel: '1-2 mg/kg',
    calculatedAt: '2 mg/kg (topo da faixa)',
    instruction:
      'Administrar precocemente na crise moderada/grave. Max: 40 mg/dia, por 3-5 dias; via VO preferencial.',
    // O ANY arredonda o volume para cima (mL inteiro de solução oral).
    dose: single({ perKg: 2, cap: 40 }, 'mg', 0, conc(3, 0, 'para-cima'), {
      note: { kind: 'texto', text: 'VO 1x/dia' },
    }),
  },
  {
    id: 'metilprednisolona',
    name: 'METILPREDNISOLONA SUCCINATO',
    presentation: '--',
    doseLabel: '1 mg/kg',
    instruction: 'Crise grave (EV). Max: 80 mg. Diluir em 20-50 mL de SF e correr EV em 20 min.',
    dose: single({ perKg: 1, cap: 80 }, 'mg', 0, NO_VOLUME, {
      note: { kind: 'texto', text: 'em 20-50 mL de SF, EV em 20 min' },
    }),
  },
  {
    id: 'magnesio10-resp',
    name: 'SULFATO DE MAGNÉSIO 10%',
    presentation: '100 mg/mL',
    doseLabel: '50 mg/kg',
    instruction: 'Crise grave refratária. Max: 2000 mg. Diluir em SF e correr EV em 20 min.',
    dose: single({ perKg: 50, cap: 2000 }, 'mg', 0, conc(100, 1), {
      note: { kind: 'soro', verb: 'diluir em', dosePerMl: 10 },
    }),
  },
  {
    id: 'magnesio50-resp',
    name: 'SULFATO DE MAGNÉSIO 50%',
    presentation: '500 mg/mL',
    doseLabel: '50 mg/kg',
    instruction: 'Crise grave refratária. Max: 2000 mg. Completar com SF e correr EV em 20 min.',
    dose: single({ perKg: 50, cap: 2000 }, 'mg', 0, conc(500, 1), {
      note: { kind: 'soro', verb: 'completar até', dosePerMl: 10 },
    }),
  },
];

// ==========================================
// TOXICOLOGIA E ANTÍDOTOS
// ==========================================

const TOXICOLOGY: readonly BolusDrug[] = [
  {
    id: 'atropina-tox',
    name: 'ATROPINA (organofosforados)',
    presentation: '0,5 mg/mL',
    doseLabel: '0,02-0,05 mg/kg',
    instruction:
      'Mín.: 0,1 mg. EV em bolus; repetir a cada 3-5 min, dobrando a dose até controle de secreções e ventilação. Não há dose cumulativa máxima na síndrome colinérgica grave.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 0.02, floor: 0.1 },
        { perKg: 0.05, floor: 0.1 },
      ],
      join: ' - ',
      unit: 'mg',
      doseDecimals: 2,
      volume: conc(0.5, 2),
    },
  },
  {
    id: 'bicarbonato-tox',
    name: 'BICARBONATO DE SÓDIO 8,4%',
    presentation: '1 mEq/mL',
    doseLabel: '1-2 mEq/kg',
    instruction:
      'Bloqueador de canal de sódio: bolus, repetir guiado por QRS e pH. Salicilato: solução com 132-150 mEq/L em SG 5%, infundida por peso para diurese 2-3 mL/kg/h; alvo de pH urinário 7,5-8,0 e sérico 7,50-7,55. Max: 250 mEq.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 1, cap: 250 },
        { perKg: 2, cap: 250 },
      ],
      join: ' - ',
      unit: 'mEq',
      doseDecimals: 0,
      volume: conc(1, 0),
    },
  },
  {
    id: 'emulsao-lipidica',
    name: 'EMULSÃO LIPÍDICA 20%',
    presentation: 'Pronta para uso',
    doseLabel: '1,5 mL/kg',
    instruction:
      'Toxicidade sistêmica por anestésico local: bolus em 2-3 min, seguido de infusão de 0,25 mL/kg/min por 30-60 min. Pode repetir o bolus conforme resposta; total sugerido até 12 mL/kg. Para outros lipofílicos, somente sob orientação do CIATox.',
    dose: {
      kind: 'bolus-e-infusao',
      bolus: { perKg: 1.5, cap: 100 },
      unit: 'mL',
      doseDecimals: 1,
      // 0,25 mL/kg/min × 60 = 15 mL/kg/h. O ANY faz peso × 0,25 × 60; peso ×
      // 0,25 é exato em ponto flutuante, então peso × 15 dá o mesmo número.
      infusionMlPerKgPerHour: [15],
      infusionDecimals: 0,
      note: 'bolus mL / infusão mL/h (0,25 mL/kg/min)',
    },
  },
  {
    id: 'glicose10-tox',
    name: 'GLICOSE — suporte à insulina em alta dose',
    presentation: 'G10% ou concentração ajustada ao acesso',
    doseLabel: 'bolus 0,5-1 g/kg; 0,5 g/kg/h',
    instruction:
      'Se glicemia abaixo de 250 mg/dL, administrar bolus antes ou junto da insulina. Titular a infusão para manter 100-200 mg/dL; usar solução mais concentrada em acesso central. Monitorar glicemia a cada 15-30 min.',
    dose: { kind: 'holliday-segar', capMlPerHour: 90, note: 'mL/h EV' },
  },
  {
    id: 'glucagon-tox',
    name: 'GLUCAGON (Betabloqueador/BCC)',
    presentation: '1 mg/mL',
    doseLabel: '0,05 mg/kg',
    instruction:
      'Preparo: 4 mg (4 mL) + SG 5% 46 mL = 50 mL, concentração 0,08 mg/mL. Ataque max: 10 mg. Manutenção: 0,05-0,1 mg/kg/h na mesma diluição. Benefício incerto: antecipar náuseas e vômitos e discutir com o CIATox.',
    dose: single({ perKg: 0.05, cap: 10 }, 'mg', 2, conc(0.08, 2), {
      note: { kind: 'texto', text: 'da solução 0,08 mg/mL' },
    }),
  },
  {
    id: 'gluconato-tox',
    name: 'GLUCONATO DE CÁLCIO 10%',
    presentation: '100 mg/mL',
    doseLabel: '60 mg/kg',
    instruction:
      'Intoxicação por BCC / hipocalcemia. Max: 2000 mg. Diluir em AD/SF e infundir lento.',
    dose: single({ perKg: 60, cap: 2000 }, 'mg', 0, conc(100, 1)),
  },
  {
    id: 'hidroxicobalamina',
    name: 'HIDROXICOBALAMINA',
    presentation: '5 g/200 mL',
    doseLabel: '70 mg/kg',
    instruction: 'Intoxicação por cianeto (inalação de fumaça). Max: 5 g. EV.',
    dose: single({ perKg: 70, cap: 5000 }, 'mg', 0, conc(25, 1)),
  },
  {
    id: 'insulina-tox',
    name: 'INSULINA EM ALTA DOSE (BB/BCC)',
    presentation: '100 UI/mL',
    doseLabel: 'bolus 1 UI/kg; 0,5-1 UI/kg/h',
    instruction:
      'Diluir 100 UI em 100 mL de SF (1 UI/mL). Titular por resposta hemodinâmica, podendo exigir doses maiores sob orientação do CIATox. Associar glicose conforme glicemia. Monitorar glicemia a cada 15-30 min e potássio, magnésio e fósforo.',
    dose: {
      kind: 'bolus-e-infusao',
      bolus: { perKg: 1 },
      unit: 'UI',
      doseDecimals: 0,
      // 0,5 a 1 UI/kg/h a 1 UI/mL.
      infusionMlPerKgPerHour: [0.5, 1],
      infusionDecimals: 1,
      note: 'bolus UI / infusão mL/h',
    },
  },
  {
    id: 'naloxona-tox',
    name: 'NALOXONA',
    presentation: '0,4 mg/mL',
    doseLabel: '0,1 mg/kg',
    instruction:
      'Apneia ou intoxicação grave: max. 2 mg por dose, repetir conforme resposta. Havendo possibilidade de dependência com ventilação presente, titular doses menores (0,01 mg/kg) ao efeito respiratório. Considerar infusão em opioide de longa duração. Via: IV, IO, IM, IN.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 0.1, cap: 0.4, label: 'na dose menor' },
        { perKg: 0.1, cap: 2, label: 'por dose' },
      ],
      join: ' - ',
      unit: 'mg',
      doseDecimals: 2,
      volume: conc(0.4, 1),
    },
  },
  {
    id: 'octreotide-tox',
    name: 'OCTREOTIDE (Sulfonilureias)',
    presentation: '0,1 mg/mL',
    doseLabel: '1-2 mcg/kg',
    instruction: 'Hipoglicemia refratária por sulfonilureia. Max: 50 mcg. EV bolus.',
    dose: {
      kind: 'por-kg',
      legs: [
        { perKg: 1, cap: 50 },
        { perKg: 2, cap: 50 },
      ],
      join: ' / ',
      unit: 'mcg',
      doseDecimals: 0,
      volume: conc(100, 2),
    },
  },
  {
    id: 'vitamina-k',
    name: 'VITAMINA K',
    presentation: '10 mg/mL',
    doseLabel: '0,03 mg/kg',
    instruction:
      'Intoxicação por cumarínicos. Max: 5 mg. EV lento. Esquema de dose fixa também pode ser usado: 0,5-2-5 mg conforme gravidade.',
    dose: single({ perKg: 0.03, cap: 5 }, 'mg', 2, conc(10, 2)),
  },
  {
    id: 'nac-fase1',
    name: 'N-ACETILCISTEÍNA — Fase 1 (1ª hora)',
    presentation: '100 mg/mL',
    doseLabel: '150 mg/kg',
    instruction: 'Intoxicação por paracetamol. Max: 15000 mg. Diluir em SF e infundir em 1 h.',
    dose: single({ perKg: 150, cap: 15000 }, 'mg', 0, conc(100, 1), {
      note: { kind: 'soro', verb: 'diluir em', dosePerMl: 30 },
    }),
  },
  {
    id: 'nac-fase2',
    name: 'N-ACETILCISTEÍNA — Fase 2 (4 h)',
    presentation: '100 mg/mL',
    doseLabel: '50 mg/kg',
    instruction: 'Max: 5000 mg. Diluir em SF e infundir nas próximas 4 h.',
    dose: single({ perKg: 50, cap: 5000 }, 'mg', 0, conc(100, 1), {
      note: { kind: 'soro', verb: 'diluir em', dosePerMl: 10, round: 'para-cima' },
    }),
  },
  {
    id: 'nac-fase3',
    name: 'N-ACETILCISTEÍNA — Fase 3 (16 h)',
    presentation: '100 mg/mL',
    doseLabel: '100 mg/kg',
    instruction: 'Max: 10000 mg. Diluir em SF e infundir nas próximas 16 h.',
    dose: single({ perKg: 100, cap: 10000 }, 'mg', 0, conc(100, 1), {
      note: { kind: 'soro', verb: 'diluir em', dosePerMl: 10 },
    }),
  },
  {
    id: 'nac-alternativo',
    name: 'N-ACETILCISTEÍNA — Infusão única (alternativo)',
    presentation: '15 g + SF 350 mL (30 mg/mL)',
    doseLabel: '15 mg/kg/h',
    instruction:
      'Após o ataque de 150 mg/kg na primeira hora. Manter somente sob protocolo ou orientação do CIATox, até paracetamol indetectável, melhora de AST/ALT e critérios clínico-laboratoriais de interrupção. Max: 1500 mg/h.',
    dose: single({ perKg: 15, cap: 1500 }, 'mg/h', 0, conc(30, 1), {
      note: { kind: 'texto', text: 'mg/h = mL/h da solução 30 mg/mL' },
    }),
  },
];

// ==========================================
// ANTI-HISTAMÍNICOS POR IDADE
// ==========================================

const BY_AGE: readonly BolusDrug[] = [
  {
    id: 'loratadina',
    name: 'LORATADINA',
    presentation: '1 mg/mL — xarope',
    doseLabel: '5 mg ou 10 mg',
    instruction:
      'Adjuvante apenas para sintomas cutâneos após estabilização. 2-5 anos ou até 30 kg: 5 mg VO; a partir de 6 anos ou acima de 30 kg: 10 mg VO. Evitar anti-histamínicos de 1ª geração.',
    dose: {
      kind: 'por-idade',
      minimumYears: 2,
      belowMinimumMessage: 'Geralmente não recomendado abaixo de 2 anos',
      bands: [{ belowYears: 6, upToKg: 30, doses: [5], note: 'VO 1x/dia' }],
      otherwise: { doses: [10], note: 'VO 1x/dia' },
      unit: 'mg',
    },
  },
  {
    id: 'cetirizina',
    name: 'CETIRIZINA',
    presentation: '1 mg/mL — solução oral',
    doseLabel: '2,5-10 mg',
    instruction:
      'Adjuvante apenas para sintomas cutâneos após estabilização. 2-5 anos: 2,5-5 mg VO; a partir de 6 anos: 10 mg VO.',
    dose: {
      kind: 'por-idade',
      minimumYears: 2,
      belowMinimumMessage: 'Geralmente não recomendado abaixo de 2 anos',
      bands: [{ belowYears: 6, doses: [2.5, 5], note: 'VO 1x/dia (2 a 5 anos)' }],
      otherwise: { doses: [10], note: 'VO 1x/dia (6 anos ou mais)' },
      unit: 'mg',
    },
  },
];

export const BOLUS_GROUP_IDS = [
  'pcr',
  'iot',
  'emergencia',
  'anticonvulsivantes',
  'neuro',
  'dor-sedacao',
  'respiratorio',
  'toxicologia',
  'anti-histaminicos',
] as const;

export type BolusGroupId = (typeof BOLUS_GROUP_IDS)[number];

export interface BolusGroup {
  id: BolusGroupId;
  title: string;
  drugs: readonly BolusDrug[];
  /** Aviso fixo no topo do grupo (o do CIATox na toxicologia). */
  notice?: string;
}

/** Grupos na ordem em que o PedGuide v4 mostra (PCR primeiro, como na tela de PCR). */
export const BOLUS_GROUPS: readonly BolusGroup[] = [
  { id: 'pcr', title: 'Drogas de parada cardiorrespiratória', drugs: PCR },
  { id: 'iot', title: 'Drogas de intubação (ISR)', drugs: IOT },
  { id: 'emergencia', title: 'Outras drogas de emergência', drugs: EMERGENCY },
  { id: 'anticonvulsivantes', title: 'Anticonvulsivantes', drugs: ANTICONVULSANTS },
  { id: 'neuro', title: 'Neuroproteção e osmoterapia', drugs: NEURO },
  { id: 'dor-sedacao', title: 'Dor e sedação para procedimentos', drugs: PAIN },
  { id: 'respiratorio', title: 'Crise asmática e broncoespasmo', drugs: RESPIRATORY },
  {
    id: 'toxicologia',
    title: 'Toxicologia e antídotos',
    drugs: TOXICOLOGY,
    notice:
      'O contato com o CIATox é obrigatório nas intoxicações graves, nos esquemas de antídotos de alto risco e sempre que houver dúvida sobre agente, dose, formulação, indicação de diálise ou critério de interrupção. As doses abaixo são medidas iniciais.',
  },
  { id: 'anti-histaminicos', title: 'Anti-histamínicos por idade', drugs: BY_AGE },
];

export const BOLUS_DRUGS: readonly BolusDrug[] = BOLUS_GROUPS.flatMap(({ drugs }) => drugs);

const BY_ID = new Map(BOLUS_DRUGS.map((drug) => [drug.id, drug]));

export function getBolusDrug(id: string): BolusDrug | undefined {
  return BY_ID.get(id);
}

/** Preparos do PedGuide v4 ("Como preparar"). */
export const PREPARATIONS: Record<
  NonNullable<BolusDrug['preparation']>,
  { title: string; steps: readonly string[] }
> = {
  epinefrina: {
    title: 'Epinefrina 1:10.000',
    steps: [
      'Aspirar 1 mL de Epinefrina 1:1.000 (1 mg/mL)',
      'Adicionar 9 mL de Água Destilada',
      'Volume final: 10 mL',
      'Concentração: 0,1 mg/mL (1:10.000)',
      'Dose: 0,1 mL/kg desta solução',
    ],
  },
  nacl3: {
    title: 'NaCl 3% (Salina Hipertônica)',
    steps: [
      'Aspirar 15 mL de NaCl 20%',
      'Adicionar 85 mL de Água Destilada',
      'Volume final: 100 mL de NaCl 3%',
      'Concentração: 0,513 mEq Na/mL',
      'Alt: NaCl 10% 30 mL + AD 70 mL',
    ],
  },
};
