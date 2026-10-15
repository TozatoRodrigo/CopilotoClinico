import { describe, expect, it } from 'vitest';
import { PS_SYNDROMES, type CaseToolFacts, type PsSyndrome } from '../contracts/clinical';
import {
  CASE_TOOL_MAPPING_PROVENANCE,
  DATA_RULES,
  MAX_CASE_TOOL_SUGGESTIONS,
  SYNDROME_DECISIONS,
  caseToolFacts,
  caseToolHref,
  caseToolName,
  mentions,
  suggestCaseTools,
  weightFromText,
  type CaseReading,
  type CaseToolInput,
  type CaseToolRule,
} from './case-suggestions';
import { TOOLS } from './catalog';
import { getCalculator } from './registry';

type ReadingOverrides = Partial<Omit<CaseReading, 'structuredData'>> & {
  structuredData?: Partial<Omit<CaseReading['structuredData'], 'vitals'>> & {
    vitals?: Partial<CaseReading['structuredData']['vitals']>;
  };
};

function reading(overrides: ReadingOverrides = {}): CaseReading {
  const { structuredData = {}, ...rest } = overrides;
  const { vitals = {}, ...data } = structuredData;
  return {
    syndrome: 'outro',
    syndromeNote: null,
    problemRepresentation: 'Paciente no pronto-socorro.',
    instability: { present: false, findings: [] },
    cannotMiss: [],
    likely: [],
    ...rest,
    structuredData: {
      age: 54,
      sex: 'M',
      onset: null,
      keyFindings: [],
      relevantContext: [],
      ...data,
      vitals: {
        systolicBp: null,
        diastolicBp: null,
        heartRate: null,
        respiratoryRate: null,
        spo2: null,
        temperature: null,
        glucose: null,
        ...vitals,
      },
    },
  };
}

function input(
  overrides: ReadingOverrides = {},
  extra: Partial<CaseToolInput> = {},
): CaseToolInput {
  return { reading: reading(overrides), caseText: '', planActions: [], ...extra };
}

const hypothesis = (text: string) => ({
  hypothesis: text,
  whyPlausible: 'x',
  confirmOrRuleOut: 'y',
});

function suggested(caseInput: CaseToolInput): string[] {
  return suggestCaseTools(caseInput).suggestions.map(({ target }) =>
    target.kind === 'calculator' ? `calculadora:${target.calculatorId}` : target.toolId,
  );
}

function allRules(): CaseToolRule[] {
  return [
    ...DATA_RULES,
    ...Object.values(SYNDROME_DECISIONS).flatMap((decision) =>
      decision.kind === 'ferramentas' ? decision.rules : [],
    ),
  ];
}

describe('mapeamento síndrome → ferramenta (CC-332)', () => {
  it('toda síndrome do catálogo de PS tem decisão: ferramenta ou nenhuma, com o porquê', () => {
    for (const syndrome of PS_SYNDROMES) {
      const decision = SYNDROME_DECISIONS[syndrome];
      expect(decision, syndrome).toBeDefined();
      if (decision.kind === 'nenhuma') {
        expect(decision.why.trim().length, syndrome).toBeGreaterThan(10);
      } else {
        expect(decision.rules.length, syndrome).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(SYNDROME_DECISIONS).sort()).toEqual([...PS_SYNDROMES].sort());
  });

  it('cada regra tem id único, motivo e racional, e aponta para ferramenta que abre', () => {
    const rules = allRules();
    expect(new Set(rules.map(({ id }) => id)).size).toBe(rules.length);
    for (const rule of rules) {
      expect(rule.reason.trim(), rule.id).not.toBe('');
      expect(rule.rationale.trim(), rule.id).not.toBe('');
      if (typeof rule.target === 'function') continue;
      if (rule.target.kind === 'calculator') {
        expect(getCalculator(rule.target.calculatorId), rule.id).toBeDefined();
      } else {
        const { toolId } = rule.target;
        expect(TOOLS.find(({ id }) => id === toolId)?.status, rule.id).toBe('disponivel');
      }
      expect(caseToolName(rule.target), rule.id).not.toBeNull();
    }
  });

  it('está versionado no motor, com revisão clínica pendente do Dr. Ripardo', () => {
    expect(CASE_TOOL_MAPPING_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CASE_TOOL_MAPPING_PROVENANCE.review).toEqual({
      status: 'pendente',
      assignedTo: 'Dr. Ripardo',
    });
    expect(suggestCaseTools(input()).mappingVersion).toBe(CASE_TOOL_MAPPING_PROVENANCE.version);
  });

  it('déficit neurológico focal → NIHSS', () => {
    expect(suggested(input({ syndrome: 'deficit-neurologico-focal' }))).toEqual([
      'calculadora:nihss',
    ]);
  });

  it('dor torácica ou dispneia com TEP nas hipóteses → roteiro de TEP (Wells, PERC)', () => {
    for (const syndrome of ['dor-toracica', 'dispneia'] as const) {
      expect(
        suggested(input({ syndrome, cannotMiss: [hypothesis('Tromboembolismo pulmonar')] })),
      ).toContain('tep');
    }
    expect(suggested(input({ syndrome: 'dispneia' }))).toEqual([]);
  });

  it('sepse com hipotensão → Choque séptico; choque sem sepse → Choque indiferenciado', () => {
    expect(suggested(input({ syndrome: 'febre-hipotensao' }))).toEqual(['choque-septico']);
    expect(
      suggested(
        input({
          syndrome: 'infeccao-respiratoria',
          likely: [{ hypothesis: 'Sepse de foco pulmonar', why: 'x' }],
          structuredData: { vitals: { systolicBp: 82, diastolicBp: 50 } },
        }),
      ),
    ).toEqual(['choque-septico']);
    expect(suggested(input({ syndrome: 'choque' }))).toEqual(['choque-indiferenciado']);
    expect(
      suggested(input({ syndrome: 'choque', cannotMiss: [hypothesis('Choque séptico')] })),
    ).toEqual(['choque-septico']);
  });

  it('sepse sem hipotensão não abre o Choque séptico; "sem hipotensão" não conta', () => {
    const septic = {
      syndrome: 'febre' as const,
      likely: [{ hypothesis: 'Sepse urinária', why: 'x' }],
    };
    expect(
      suggested(
        input({ ...septic, structuredData: { vitals: { systolicBp: 128, diastolicBp: 76 } } }),
      ),
    ).toEqual([]);
    expect(
      suggested(input({ ...septic, structuredData: { keyFindings: ['Sem hipotensão'] } })),
    ).toEqual([]);
    expect(
      suggested(
        input({ ...septic, structuredData: { vitals: { systolicBp: 100, diastolicBp: 45 } } }),
      ),
    ).toEqual(['choque-septico']);
  });

  it('PCR → ACLS antes de tudo; "PCR" de proteína C-reativa não conta', () => {
    expect(
      suggested(
        input({
          syndrome: 'rebaixamento-consciencia',
          instability: { present: true, findings: ['Parada cardiorrespiratória em assistolia'] },
        }),
      )[0],
    ).toBe('acls');
    expect(
      suggested(input({ syndrome: 'febre', structuredData: { keyFindings: ['PCR 180 mg/L'] } })),
    ).toEqual([]);
  });

  it('criança → Pediatria por peso, e as ferramentas de adulto saem', () => {
    const child = input({ syndrome: 'deficit-neurologico-focal', structuredData: { age: 4 } });
    expect(suggested(child)).toEqual(['pediatria']);
    expect(suggested(input({ syndrome: 'intoxicacao', structuredData: { age: 3 } }))).toEqual([
      'pediatria',
      'toxicologia',
    ]);
    // Sem idade não há Pediatria.
    expect(
      suggested(input({ syndrome: 'diarreia-vomitos', structuredData: { age: null } })),
    ).toEqual([]);
  });

  it('plano com droga vasoativa → Infusões já na droga; "grande vaso" não é vasopressina', () => {
    expect(
      suggestCaseTools(
        input(
          { syndrome: 'choque', cannotMiss: [hypothesis('Choque séptico')] },
          { planActions: ['Considere noradrenalina se PAM < 65 após fluidos'] },
        ),
      ).suggestions.map(({ target }) => target),
    ).toEqual([
      { kind: 'tool', toolId: 'choque-septico' },
      { kind: 'tool', toolId: 'infusoes', query: { droga: 'noradrenalina' } },
    ]);
    expect(
      suggestCaseTools(input({}, { planActions: ['Considere droga vasoativa'] })).suggestions[0]
        ?.target,
    ).toEqual({ kind: 'tool', toolId: 'infusoes', query: { grupo: 'vasopressors' } });
    expect(
      suggested(
        input(
          { syndrome: 'deficit-neurologico-focal' },
          { planActions: ['Angio-TC para oclusão de grande vaso; trombectomia'] },
        ),
      ),
    ).toEqual(['calculadora:nihss']);
    // Adrenalina IM da anafilaxia não abre Infusões.
    expect(
      suggested(
        input({ syndrome: 'reacao-alergica' }, { planActions: ['Adrenalina 0,5 mg IM na coxa'] }),
      ),
    ).toEqual([]);
  });

  it('intoxicação → Toxicologia; dengue → Dengue; CAD/hiperglicemia → CAD e EHH', () => {
    expect(suggested(input({ syndrome: 'intoxicacao' }))).toEqual(['toxicologia']);
    expect(
      suggested(input({ syndrome: 'febre', likely: [{ hypothesis: 'Dengue', why: 'x' }] })),
    ).toEqual(['dengue']);
    expect(
      suggested(
        input({ syndrome: 'disturbio-glicemico', structuredData: { vitals: { glucose: 480 } } }),
      ),
    ).toEqual(['cad-ehh']);
    expect(
      suggested(
        input({ syndrome: 'disturbio-glicemico', structuredData: { vitals: { glucose: 42 } } }),
      ),
    ).toEqual([]);
    expect(
      suggested(
        input({ syndrome: 'dor-abdominal', cannotMiss: [hypothesis('Cetoacidose diabética')] }),
      ),
    ).toEqual(['cad-ehh']);
  });

  it('IOT no plano → Via aérea; paciente já intubado → Ventilação mecânica', () => {
    expect(
      suggested(
        input({ syndrome: 'dispneia' }, { planActions: ['Considere IOT em sequência rápida'] }),
      ),
    ).toEqual(['via-aerea']);
    expect(
      suggested(
        input(
          { syndrome: 'dispneia', structuredData: { keyFindings: ['Intubado, em VM'] } },
          { planActions: ['Ajuste da PEEP'] },
        ),
      ),
    ).toEqual(['ventilacao-mecanica']);
  });

  it('no máximo três sugestões, sem repetir ferramenta, na ordem de prioridade', () => {
    const busy = input(
      {
        syndrome: 'febre-hipotensao',
        instability: { present: true, findings: ['RCE após 8 minutos de RCP'] },
        cannotMiss: [hypothesis('Choque séptico'), hypothesis('TEP'), hypothesis('Dengue grave')],
      },
      { planActions: ['Considere IOT', 'Noradrenalina em bomba'] },
    );
    const result = suggested(busy);
    expect(result).toHaveLength(MAX_CASE_TOOL_SUGGESTIONS);
    expect(result).toEqual(['acls', 'via-aerea', 'choque-septico']);
    expect(new Set(result).size).toBe(result.length);
  });

  it('é determinístico: a mesma entrada dá a mesma sugestão', () => {
    const caseInput = input({
      syndrome: 'dor-toracica',
      cannotMiss: [
        hypothesis('Síndrome coronariana aguda'),
        hypothesis('Dissecção aguda de aorta'),
      ],
    });
    expect(suggestCaseTools(caseInput)).toEqual(suggestCaseTools(caseInput));
    expect(suggested(caseInput)).toEqual(['calculadora:heart-score', 'calculadora:add-rs']);
  });

  it('a negação na mesma frase anula a menção', () => {
    expect(mentions(/hipotens/, 'sem febre ou hipotensao')).toBe(false);
    expect(mentions(/hipotens/, 'sem febre, hipotenso')).toBe(true);
    expect(mentions(/\btep\b/, 'tep afastado. tep')).toBe(true);
    expect(mentions(/\btep\b/, 'nega tep')).toBe(false);
  });

  it('cada síndrome sem ferramenta não sugere nada sozinha', () => {
    const quiet = (Object.entries(SYNDROME_DECISIONS) as [PsSyndrome, { kind: string }][])
      .filter(([, decision]) => decision.kind === 'nenhuma')
      .map(([syndrome]) => syndrome);
    for (const syndrome of quiet) {
      expect(suggested(input({ syndrome })), syndrome).toEqual([]);
    }
  });
});

describe('dados do caso que preenchem as ferramentas', () => {
  it('copia idade, sexo e sinais vitais; número implausível fica de fora', () => {
    const facts = caseToolFacts(
      reading({
        structuredData: {
          age: 67,
          sex: 'F',
          vitals: {
            systolicBp: 88,
            diastolicBp: 50,
            heartRate: 124,
            respiratoryRate: 28,
            spo2: 91,
            temperature: 38.6,
            glucose: 900,
          },
        },
      }),
      '',
    );
    expect(facts).toEqual<CaseToolFacts>({
      ageYears: 67,
      sex: 'F',
      weightKg: null,
      systolicBp: 88,
      diastolicBp: 50,
      heartRate: 124,
      respiratoryRate: 28,
      spo2: 91,
      temperature: 38.6,
      glucose: 900,
    });
    const odd = caseToolFacts(
      reading({ structuredData: { age: 400, vitals: { heartRate: 0, spo2: 140 } } }),
      '',
    );
    expect([odd.ageYears, odd.heartRate, odd.spo2]).toEqual([null, null, null]);
  });

  it('acha o peso só quando o texto diz o peso do paciente', () => {
    expect(weightFromText('Homem, 54 anos, peso 82 kg, dor torácica.', 54)).toBe(82);
    expect(weightFromText('Pesando 72,5 kg.', 30)).toBe(72.5);
    expect(weightFromText('Peso estimado: 18 kg', 4)).toBe(18);
    expect(weightFromText('Perdeu 5 kg em 2 meses.', 54)).toBeNull();
    expect(weightFromText('Perda de peso de 6 kg.', 54)).toBeNull();
    expect(weightFromText('Rocurônio 1,2 mg/kg.', 54)).toBeNull();
    expect(weightFromText('Peso predito 65 kg.', 54)).toBeNull();
    // Dois pesos diferentes não decidem.
    expect(weightFromText('Peso 70 kg. Na outra internação, peso 82 kg.', 54)).toBeNull();
    // Fora da faixa da população: adulto 40–200 kg, criança 0,5–50 kg.
    expect(weightFromText('Peso 18 kg.', 54)).toBeNull();
    expect(weightFromText('Peso 70 kg.', 12)).toBeNull();
  });
});

describe('endereço da ferramenta aberta pelo plano', () => {
  it('leva só a ferramenta, o lugar dentro dela e o token opaco', () => {
    expect(caseToolHref({ kind: 'calculator', calculatorId: 'nihss' }, 'abcdefghijklmnop')).toBe(
      '/ferramentas/calculadoras/nihss?caso=abcdefghijklmnop',
    );
    expect(
      caseToolHref(
        { kind: 'tool', toolId: 'infusoes', query: { droga: 'noradrenalina' } },
        'abcdefghijklmnop',
      ),
    ).toBe('/ferramentas/infusoes?droga=noradrenalina&caso=abcdefghijklmnop');
  });

  it('nenhum dado clínico do caso vai no endereço', () => {
    const caseInput = input(
      {
        syndrome: 'febre-hipotensao',
        structuredData: {
          age: 67,
          sex: 'F',
          vitals: {
            systolicBp: 82,
            diastolicBp: 47,
            heartRate: 131,
            respiratoryRate: 33,
            spo2: 89,
          },
        },
        cannotMiss: [hypothesis('TEP')],
      },
      { caseText: 'Peso 73 kg.', planActions: ['Noradrenalina'] },
    );
    const { facts, suggestions } = suggestCaseTools(caseInput);
    expect(suggestions.length).toBeGreaterThan(0);
    const numbers = Object.values(facts)
      .filter((value): value is number => typeof value === 'number')
      .map(String);
    for (const { target } of suggestions) {
      const href = caseToolHref(target, 'qwertyuiopasdfgh');
      const [, query = ''] = href.split('?');
      const names = query.split('&').map((pair) => pair.split('=')[0]);
      expect(
        names.every((name) => ['caso', 'droga', 'grupo'].includes(name ?? '')),
        href,
      ).toBe(true);
      for (const value of numbers) expect(href, `${href} ⊅ ${value}`).not.toContain(value);
      expect(href).not.toMatch(/idade|peso|sexo|fc=|pas=|spo2/);
    }
  });
});
