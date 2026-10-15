import { describe, expect, it } from 'vitest';
import type { CaseToolFacts } from '../contracts/clinical';
import { understandingFixture } from '../../../tests/fixtures/case-understanding';
import {
  CALCULATOR_CASE_BINDINGS,
  calculatorCasePrefill,
  caseCalculatorDefinition,
} from './case-prefill';
import {
  CASE_SCORE_BINDINGS,
  SCORE_CITATIONS,
  caseScoreFacts,
  computeCaseScore,
  describeMissing,
  findScoreCitations,
  mentalStatusFromText,
  oxygenFromText,
  reportedScores,
  sameScoreValue,
  scoreItemCount,
  suggestedCalculatorIds,
  ureaFromText,
  type CaseScoreFacts,
} from './case-scores';
import { suggestCaseTools } from './case-suggestions';
import { normalizeSearchText } from './catalog';

const EMPTY: CaseScoreFacts = {
  ageYears: null,
  sex: null,
  weightKg: null,
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
  urea: null,
  gcs: null,
  mentalStatus: null,
  oxygen: null,
};

const facts = (overrides: Partial<CaseScoreFacts>): CaseScoreFacts => ({ ...EMPTY, ...overrides });

/** Pneumonia grave com tudo o que CURB-65, qSOFA, NEWS2 e índice de choque pedem. */
const SEVERE_PNEUMONIA = facts({
  ageYears: 72,
  systolicBp: 85,
  diastolicBp: 50,
  heartRate: 118,
  respiratoryRate: 32,
  spo2: 89,
  temperature: 38.9,
  urea: { value: 64, unit: 'mg/dL' },
  mentalStatus: 'confusao',
  oxygen: 'ar',
});

const norm = normalizeSearchText;

describe('dados do caso que os escores leem (CC-333)', () => {
  describe('ureia', () => {
    it.each([
      ['Ureia 64 mg/dL, creatinina 1,4', { value: 64, unit: 'mg/dL' }],
      ['uréia: 58', { value: 58, unit: 'mg/dL' }],
      ['Ur 61 Cr 1,2 K 4,5', { value: 61, unit: 'mg/dL' }],
      ['ureia sérica de 9,5 mmol/L', { value: 9.5, unit: 'mmol/L' }],
    ])('lê "%s"', (text, expected) => {
      expect(ureaFromText(norm(text))).toEqual(expected);
    });

    it.each([
      ['dois valores diferentes', 'Ureia 40 na chegada; ureia 80 após 6 h'],
      ['valor implausível', 'ureia 4 mg/dL'],
      ['sem ureia', 'creatinina 1,4; BUN 30'],
    ])('não decide com %s', (_label, text) => {
      expect(ureaFromText(norm(text))).toBeNull();
    });
  });

  describe('estado mental', () => {
    it.each([
      ['confusa e desorientada', 'confusao'],
      ['lúcida e orientada em tempo e espaço', 'alerta'],
      ['LOTE, sem déficit', 'alerta'],
      ['lúcido, porém desorientado no tempo', 'confusao'],
      ['sonolento, abre os olhos ao chamado', 'rebaixado'],
      ['responde apenas à dor', 'dor'],
      ['comatoso', 'irresponsivo'],
    ])('"%s" → %s', (text, expected) => {
      expect(mentalStatusFromText(norm(text))).toBe(expected);
    });

    it.each([
      'sem confusão mental',
      'nega confusão',
      'paciente orientado sobre sinais de alarme',
      'febre e tosse há 3 dias',
    ])('não decide com "%s"', (text) => {
      expect(mentalStatusFromText(norm(text))).toBeNull();
    });
  });

  describe('oxigênio', () => {
    it.each([
      ['SpO2 89% em ar ambiente', 'ar'],
      ['SpO2 92% aa', 'ar'],
      ['SpO2 93% com O2 em cateter nasal a 3 L/min', 'o2'],
      ['em VNI', 'o2'],
    ])('"%s" → %s', (text, expected) => {
      expect(oxygenFromText(norm(text))).toBe(expected);
    });

    it.each([
      ['as duas medidas', 'SpO2 85% em ar ambiente, 94% com O2 a 3 L/min'],
      ['sem dizer', 'SpO2 94%'],
      ['O₂ negado', 'SpO2 94%, sem O2'],
    ])('não decide com %s', (_label, text) => {
      expect(oxygenFromText(norm(text))).toBeNull();
    });
  });

  it('junta os vitais do entendimento com o que só o texto traz', () => {
    const reading = understandingFixture({
      structuredData: {
        ...understandingFixture().structuredData,
        keyFindings: ['confusão mental nova'],
      },
    });
    const result = caseScoreFacts(reading, 'Glasgow 14. Ureia 70 mg/dL. SpO2 96% em ar ambiente.');

    expect(result).toMatchObject({
      ageYears: 68,
      systolicBp: 182,
      urea: { value: 70, unit: 'mg/dL' },
      gcs: 14,
      mentalStatus: 'confusao',
      oxygen: 'ar',
    });
  });

  it('sem entendimento, não tira sinal vital nem idade do texto livre', () => {
    const result = caseScoreFacts(null, 'Homem, 70 anos, FR 32, PA 80x40. Ureia 70.');

    expect(result.ageYears).toBeNull();
    expect(result.respiratoryRate).toBeNull();
    expect(result.urea).toEqual({ value: 70, unit: 'mg/dL' });
  });
});

describe('entradas de cada escore', () => {
  // Uma grade que passa pelos dois lados de cada limiar.
  const GRID: CaseScoreFacts[] = [
    facts({
      ageYears: 20,
      heartRate: 40,
      respiratoryRate: 8,
      spo2: 99,
      temperature: 35,
      systolicBp: 220,
      diastolicBp: 90,
    }),
    facts({
      ageYears: 40,
      heartRate: 50,
      respiratoryRate: 11,
      spo2: 96,
      temperature: 36,
      systolicBp: 219,
      diastolicBp: 61,
    }),
    facts({
      ageYears: 45,
      heartRate: 90,
      respiratoryRate: 12,
      spo2: 95,
      temperature: 36.1,
      systolicBp: 111,
      diastolicBp: 60,
    }),
    facts({
      ageYears: 50,
      heartRate: 100,
      respiratoryRate: 20,
      spo2: 94,
      temperature: 37.3,
      systolicBp: 110,
      diastolicBp: 70,
    }),
    facts({
      ageYears: 64,
      heartRate: 101,
      respiratoryRate: 22,
      spo2: 93,
      temperature: 38,
      systolicBp: 101,
      diastolicBp: 70,
    }),
    facts({
      ageYears: 65,
      heartRate: 110,
      respiratoryRate: 24,
      spo2: 92,
      temperature: 38.1,
      systolicBp: 100,
      diastolicBp: 70,
    }),
    facts({
      ageYears: 80,
      heartRate: 130,
      respiratoryRate: 25,
      spo2: 91,
      temperature: 39,
      systolicBp: 91,
      diastolicBp: 50,
    }),
    facts({
      ageYears: 90,
      heartRate: 131,
      respiratoryRate: 30,
      spo2: 80,
      temperature: 39.1,
      systolicBp: 90,
      diastolicBp: 40,
    }),
    facts({ systolicBp: 89, oxygen: 'o2', mentalStatus: 'alerta', gcs: 15 }),
    facts({ oxygen: 'ar', mentalStatus: 'confusao', gcs: 13 }),
  ];

  it('toda ligação aponta para item, opção e campo que existem', () => {
    for (const [id, binding] of Object.entries(CASE_SCORE_BINDINGS)) {
      const definition = caseCalculatorDefinition(id);
      expect(definition, id).toBeDefined();
      for (const source of binding.items ?? []) {
        const item = definition?.items?.find(({ id: itemId }) => itemId === source.item);
        expect(item, `${id}.${source.item}`).toBeDefined();
        for (const row of GRID) {
          const option = source.answer(row);
          if (option !== null) {
            expect(
              item?.options.map(({ id: optionId }) => optionId),
              `${id}.${source.item}`,
            ).toContain(option);
          }
        }
      }
      for (const source of binding.inputs ?? []) {
        expect(
          definition?.kind === 'formula' &&
            definition.inputs.some(({ id: inputId }) => inputId === source.input),
          `${id}.${source.input}`,
        ).toBe(true);
      }
    }
  });

  it('responde igual ao preenchimento da CC-332 nos itens que as duas tabelas leem', () => {
    for (const [id, binding] of Object.entries(CALCULATOR_CASE_BINDINGS)) {
      const definition = caseCalculatorDefinition(id);
      if (!definition) throw new Error(id);
      for (const row of GRID) {
        const prefill = calculatorCasePrefill(definition, row as CaseToolFacts);
        for (const { item } of binding.items ?? []) {
          const scoreSource = CASE_SCORE_BINDINGS[id]?.items?.find(
            (source) => source.item === item,
          );
          const prefilled = prefill.items[item];
          // O preenchimento só deixa vazio; quando ele responde, o escore responde igual.
          if (prefilled !== undefined)
            expect(scoreSource?.answer(row), `${id}.${item}`).toBe(prefilled);
        }
      }
    }
  });

  it('NEWS2: cada faixa nos dois lados do limite', () => {
    const news = CASE_SCORE_BINDINGS.news2?.items ?? [];
    const answer = (item: string, row: Partial<CaseScoreFacts>) =>
      news.find((source) => source.item === item)?.answer(facts(row));
    expect(
      [8, 9, 11, 12, 20, 21, 24, 25].map((rr) => answer('rr', { respiratoryRate: rr })),
    ).toEqual(['lte8', '9-11', '9-11', '12-20', '12-20', '21-24', '21-24', 'gte25']);
    expect([91, 92, 93, 94, 95, 96].map((spo2) => answer('spo2', { spo2 }))).toEqual([
      'lte91',
      '92-93',
      '92-93',
      '94-95',
      '94-95',
      'gte96',
    ]);
    expect(
      [35, 35.1, 36, 36.1, 38, 38.1, 39, 39.1].map((temperature) =>
        answer('temp', { temperature }),
      ),
    ).toEqual([
      'lte35',
      '35.1-36',
      '35.1-36',
      '36.1-38',
      '36.1-38',
      '38.1-39',
      '38.1-39',
      'gte39.1',
    ]);
    expect(
      [90, 91, 100, 101, 110, 111, 219, 220].map((systolicBp) => answer('sbp', { systolicBp })),
    ).toEqual(['lte90', '91-100', '91-100', '101-110', '101-110', '111-219', '111-219', 'gte220']);
    expect(
      [40, 41, 50, 51, 90, 91, 110, 111, 130, 131].map((heartRate) => answer('hr', { heartRate })),
    ).toEqual([
      'lte40',
      '41-50',
      '41-50',
      '51-90',
      '51-90',
      '91-110',
      '91-110',
      '111-130',
      '111-130',
      'gte131',
    ]);
  });

  it('estado mental: Glasgow e texto discordando não decidem nada', () => {
    const conflict = facts({ gcs: 15, mentalStatus: 'confusao' });
    const answer = (id: string, item: string) =>
      CASE_SCORE_BINDINGS[id]?.items?.find((source) => source.item === item)?.answer(conflict);

    expect(answer('curb65', 'confusion')).toBeNull();
    expect(answer('qsofa', 'gcs')).toBeNull();
    expect(answer('news2', 'consciousness')).toBeNull();
  });

  it('Glasgow abaixo de 15 sozinho é alteração para o qSOFA, mas não é confusão para o CURB-65', () => {
    const gcs14 = facts({ gcs: 14 });
    expect(CASE_SCORE_BINDINGS.qsofa?.items?.find((s) => s.item === 'gcs')?.answer(gcs14)).toBe(
      'sim',
    );
    expect(
      CASE_SCORE_BINDINGS.curb65?.items?.find((s) => s.item === 'confusion')?.answer(gcs14),
    ).toBeNull();
    expect(
      CASE_SCORE_BINDINGS.news2?.items?.find((s) => s.item === 'consciousness')?.answer(gcs14),
    ).toBeNull();
  });
});

describe('computeCaseScore', () => {
  it('calcula o CURB-65 com o motor e lista as entradas usadas', () => {
    expect(computeCaseScore('curb65', SEVERE_PNEUMONIA)).toEqual({
      status: 'complete',
      calculatorId: 'curb65',
      label: 'CURB-65',
      value: 5,
      valueText: '5 pontos',
      band: 'Alta gravidade',
      inputs: [
        'estado mental: confusão',
        'ureia 64 mg/dL',
        'FR 32 irpm',
        'PA 85x50 mmHg',
        'idade 72 anos',
      ],
    });
  });

  it('calcula qSOFA, NEWS2 e índice de choque do mesmo caso', () => {
    expect(computeCaseScore('qsofa', SEVERE_PNEUMONIA)).toMatchObject({
      status: 'complete',
      value: 3,
    });
    // FR 32 (3) + SpO₂ 89 (3) + ar (0) + 38,9 °C (1) + PAS 85 (3) + FC 118 (2) + confusão (3).
    expect(computeCaseScore('news2', SEVERE_PNEUMONIA)).toMatchObject({
      status: 'complete',
      value: 15,
    });
    expect(computeCaseScore('shock-index', SEVERE_PNEUMONIA)).toMatchObject({
      status: 'complete',
      value: 1.39,
      valueText: '1,39',
      inputs: ['FC 118 bpm', 'PAS 85 mmHg'],
    });
  });

  it('sem um dado, não calcula e diz o que falta', () => {
    expect(computeCaseScore('curb65', { ...SEVERE_PNEUMONIA, urea: null })).toEqual({
      status: 'incomplete',
      calculatorId: 'curb65',
      label: 'CURB-65',
      missing: ['ureia'],
    });
    expect(
      computeCaseScore('news2', { ...SEVERE_PNEUMONIA, oxygen: null, mentalStatus: 'rebaixado' }),
    ).toMatchObject({
      status: 'incomplete',
      missing: ['uso de O₂ suplementar', 'nível de consciência (ACVPU)'],
    });
  });

  it('escore sem ligação pede todos os itens pelo rótulo', () => {
    const result = computeCaseScore('chadsvasc', SEVERE_PNEUMONIA);
    expect(result).toMatchObject({ status: 'incomplete', label: 'CHA₂DS₂-VASc' });
    expect(result?.status === 'incomplete' && result.missing.length).toBe(
      scoreItemCount('chadsvasc'),
    );
  });

  it('escreve o item que falta em minúscula, mas mantém a sigla', () => {
    expect(computeCaseScore('wells-tep', SEVERE_PNEUMONIA)).toMatchObject({
      status: 'incomplete',
      missing: [
        'sinais clínicos de TVP',
        'TEP mais provável que outros diagnósticos',
        'imobilização (≥ 3 dias) ou cirurgia nas últimas 4 semanas',
        'TVP ou TEP prévios',
        'hemoptise',
        'câncer ativo',
      ],
    });
  });

  it('id que o motor não conhece', () => {
    expect(computeCaseScore('nao-existe', SEVERE_PNEUMONIA)).toBeNull();
  });
});

describe('describeMissing', () => {
  it.each([
    [['ureia'], 5, 'ureia'],
    [['ureia', 'idade'], 5, 'ureia e idade'],
    [['a', 'b', 'c'], 5, 'a, b e c'],
    [['a', 'b', 'c', 'd'], 5, 'a, b e mais 2 itens'],
    [['a', 'b', 'c', 'd', 'e'], 5, 'os 5 itens'],
  ])('%j de %i', (missing, total, expected) => {
    expect(describeMissing(missing, total)).toBe(expected);
  });
});

describe('escores citados num texto', () => {
  const cited = (text: string) =>
    findScoreCitations(text).map(({ calculatorId, value }) => [calculatorId, value]);

  it('todo escore do catálogo existe no motor', () => {
    for (const { calculatorId } of SCORE_CITATIONS) {
      expect(caseCalculatorDefinition(calculatorId), calculatorId).toBeDefined();
    }
  });

  it.each([
    ['Internação em UTI (CURB-65 de 3 pontos)', [['curb65', 3]]],
    ['CURB 65 = 2', [['curb65', 2]]],
    ['qSOFA 2/3 com hipotensão', [['qsofa', 2]]],
    ['quick SOFA: 1', [['qsofa', 1]]],
    ['SOFA de 6', [['sofa', 6]]],
    ['NEWS2 de 7', [['news2', 7]]],
    ['NEWS 7: avaliação médica urgente', [['news2', 7]]],
    ['NEWS 2 de 7', [['news2', 7]]],
    ['NEWS-2 = 12', [['news2', 12]]],
    ['Índice de choque 1,4', [['shock-index', 1.4]]],
    ['Glasgow 8, proteger via aérea', [['gcs', 8]]],
    ['Glasgow-Blatchford de 9', [['glasgow-blatchford', 9]]],
    ['NIHSS 12', [['nihss', 12]]],
    ['HEART score 5', [['heart-score', 5]]],
    ['escore de Wells para TEP de 4,5', [['wells-tep', 4.5]]],
    ['PERC 0', [['perc-rule', 0]]],
    ['CHA2DS2-VASc 4', [['chadsvasc', 4]]],
    ['CHA₂DS₂-VASc de 3', [['chadsvasc', 3]]],
    ['TIMI 4', [['timi-nstemi', 4]]],
    // Texto de prontuário das Ferramentas (chart-note.ts).
    ['Escala de Coma de Glasgow (GCS): 14 pontos — Leve', [['gcs', 14]]],
    ['NEWS2 (National Early Warning Score): 5 pontos — Risco médio.', [['news2', 5]]],
    [
      'CURB-65 de 3 e qSOFA 2',
      [
        ['curb65', 3],
        ['qsofa', 2],
      ],
    ],
  ])('cita "%s"', (text, expected) => {
    expect(cited(text)).toEqual(expected);
  });

  it.each([
    ['limiar', 'CURB-65 ≥ 3 indica UTI'],
    ['limiar por extenso', 'qSOFA maior ou igual a 2'],
    ['limiar depois do número', 'CURB-65 de 3 ou mais'],
    ['limiar depois de pontos', 'HEART de 4 pontos ou mais'],
    ['faixa', 'CURB-65 0–1 permite tratamento ambulatorial'],
    ['faixa por extenso', 'HEART 4 a 6'],
    ['sem número', 'Calcular CURB-65 e qSOFA'],
    ['nome do NEWS2 com espaço', 'Reavaliar o NEWS 2 a cada 4 h'],
    ['tempo', 'Repetir NIHSS em 24 h'],
    ['reavaliação', 'Glasgow de 1 em 1 hora'],
    ['fluxo da angiografia', 'Fluxo TIMI 3 após a angioplastia'],
    ['Wells de TVP', 'Wells para TVP 2'],
    ['palavra em inglês', 'heart rate 110'],
    ['ECG não é Glasgow', 'ECG 12 derivações'],
  ])('não cita valor com %s', (_label, text) => {
    expect(cited(text)).toEqual([]);
  });

  it('marca onde está o número e o "pontos" para a correção', () => {
    const text = 'Internação (CURB-65 de 3 pontos), já';
    const [citation] = findScoreCitations(text);

    expect(text.slice(citation?.start, citation?.end)).toBe('CURB-65 de 3 pontos');
    expect(text.slice(citation?.valueStart, citation?.valueEnd)).toBe('3');
    expect(citation?.points?.text).toBe(' pontos');
    expect(citation?.nameText).toBe('CURB-65');
  });

  it('o caso informa o valor; com dois, vale o último', () => {
    expect(reportedScores('Glasgow 15 na chegada; agora Glasgow 12.')).toEqual(
      new Map([['gcs', 12]]),
    );
  });

  it.each([
    [{ value: 1.4, decimals: 1 }, 1.39, true],
    [{ value: 1.39, decimals: 2 }, 1.39, true],
    [{ value: 1, decimals: 0 }, 1.39, false],
    [{ value: 3, decimals: 0 }, 3, true],
    [{ value: 3, decimals: 0 }, 5, false],
  ])('%j bate com %d: %s', (citation, reference, expected) => {
    expect(sameScoreValue(citation, reference)).toBe(expected);
  });
});

describe('calculadoras sugeridas pela CC-332', () => {
  it('pega a calculadora sugerida e as de dentro do roteiro', () => {
    const reading = understandingFixture({
      syndrome: 'infeccao-respiratoria',
      likely: [{ hypothesis: 'Pneumonia adquirida na comunidade', why: 'Febre e tosse' }],
      cannotMiss: [
        { hypothesis: 'TEP', whyPlausible: 'Dispneia súbita', confirmOrRuleOut: 'Angio-TC' },
      ],
    });
    const suggestions = suggestCaseTools({ reading, caseText: '', planActions: [] });

    expect(suggestedCalculatorIds(suggestions)).toEqual(['wells-tep', 'perc-rule', 'curb65']);
  });
});
