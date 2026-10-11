import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { maskPII } from '../../src/modules/copilot/guardrails/pii-filter';
import { scanForInjection } from '../../src/modules/copilot/guardrails/injection-defense';
import { FIELD_INCIDENT_CASES } from '../../tests/fixtures/field-incident-cases';
import { KB_001_SYNTHETIC_CASES } from '../../tests/fixtures/kb-001-synthetic-cases';
import { SYNDROME_GROUPS } from './case.schema';
import { CASES_DIR, CaseFileError, loadCaseSet, selectCases } from './cases';
import { normalizeForMatching } from './graders/deterministic';

const { cases } = loadCaseSet();
const caseById = new Map(cases.map((clinicalCase) => [clinicalCase.id, clinicalCase]));

describe('gabarito clínico v0', () => {
  it('carrega todos os arquivos de caso com ids únicos', () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
    expect(new Set(cases.map((clinicalCase) => clinicalCase.id)).size).toBe(cases.length);
  });

  it('começa as tags de todo caso pela síndrome de PS', () => {
    for (const clinicalCase of cases) {
      expect(SYNDROME_GROUPS, clinicalCase.id).toContain(clinicalCase.tags[0]);
    }
  });

  it('exige ao menos uma hipótese "não pode errar" em todo caso crítico', () => {
    const critical = cases.filter((clinicalCase) => clinicalCase.critical);
    expect(critical.length).toBeGreaterThan(0);
    for (const clinicalCase of critical) {
      expect(clinicalCase.expected.cannotMiss.length, clinicalCase.id).toBeGreaterThan(0);
    }
  });

  it('mantém como rascunho todo gabarito ainda não revisado por médico', () => {
    for (const clinicalCase of cases) {
      if (clinicalCase.review.status === 'physician_reviewed') {
        expect(clinicalCase.review.reviewer, clinicalCase.id).toBeDefined();
      }
    }
  });

  it('traz os 40 casos do KB-001 com o texto do fixture, sem alteração', () => {
    for (const fixture of KB_001_SYNTHETIC_CASES) {
      const clinicalCase = caseById.get(`kb001-${fixture.id}`);
      expect(clinicalCase, fixture.id).toBeDefined();
      expect(clinicalCase?.input.caseText).toBe(fixture.clinicalInput);
      expect(clinicalCase?.expected.expectedPath).toBe(fixture.expectedDecision);
      expect(clinicalCase?.goldSource).toBe('kb001_synthetic');
    }
  });

  it('traz os incidentes de campo com o texto reportado, sem alteração', () => {
    for (const incident of FIELD_INCIDENT_CASES) {
      const clinicalCase = caseById.get(incident.id);
      expect(clinicalCase?.input.caseText, incident.id).toBe(incident.clinicalInput);
      expect(clinicalCase?.goldSource).toBe('field_incident');
    }
    expect(caseById.get('fi-003-avc-flutuante-como-hemorragico')?.critical).toBe(true);
  });

  // `mustRequest` fica de fora de propósito: nos casos do KB-001 o próprio
  // médico escreve "sem informação sobre X" — nomear o dado que falta é o
  // texto do caso, não a resposta.
  it('nunca vaza a resposta esperada no texto do caso', () => {
    for (const clinicalCase of cases) {
      const caseText = normalizeForMatching(clinicalCase.input.caseText);
      const expectations = [
        clinicalCase.expected.syndrome,
        ...clinicalCase.expected.cannotMiss,
        ...clinicalCase.expected.requiredActions,
      ];
      for (const expectation of expectations) {
        expect(caseText, `${clinicalCase.id}: "${expectation}"`).not.toContain(
          normalizeForMatching(expectation),
        );
      }
    }
  });

  // O pipeline mascara PII e bloqueia "injeção" ANTES do modelo. Um caso que
  // dispare qualquer um dos dois mediria o filtro, não o modelo.
  it('chega ao modelo exatamente como escrito (sem PII mascarada nem bloqueio de injeção)', () => {
    for (const clinicalCase of cases) {
      expect(maskPII(clinicalCase.input.caseText).hasPII, clinicalCase.id).toBe(false);
      expect(scanForInjection(clinicalCase.input.caseText).safe, clinicalCase.id).toBe(true);
    }
  });
});

describe('selectCases', () => {
  it('seleciona o subconjunto crítico', () => {
    const selected = selectCases(cases, 'critical');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((clinicalCase) => clinicalCase.critical)).toBe(true);
  });

  it('seleciona por glob no id e une seletores separados por vírgula', () => {
    const selected = selectCases(cases, 'fi-*,kb004-choque-*');
    expect(selected.map((clinicalCase) => clinicalCase.id)).toEqual(
      expect.arrayContaining(['fi-001-dengue-como-sepse', 'kb004-choque-cardiogenico-pos-iam']),
    );
    expect(selected.every((c) => c.id.startsWith('fi-') || c.id.startsWith('kb004-choque-'))).toBe(
      true,
    );
  });

  it('seleciona por tag', () => {
    const selected = selectCases(cases, 'tag:cefaleia');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((clinicalCase) => clinicalCase.tags.includes('cefaleia'))).toBe(true);
  });

  it('falha quando nada é selecionado', () => {
    expect(() => selectCases(cases, 'nao-existe-*')).toThrow(CaseFileError);
  });
});

describe('loadCaseSet', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function writeCase(fileName: string, content: unknown): void {
    dir ??= mkdtempSync(join(tmpdir(), 'gabarito-'));
    writeFileSync(join(dir, fileName), JSON.stringify(content));
  }

  const validCase = JSON.parse(
    readFileSync(join(CASES_DIR, 'fi-001-dengue-como-sepse.json'), 'utf-8'),
  ) as Record<string, unknown>;

  it('recusa campo desconhecido, para um nome digitado errado não passar em silêncio', () => {
    writeCase('fi-001-dengue-como-sepse.json', { ...validCase, cannotmiss: [] });
    expect(() => loadCaseSet(dir)).toThrow(/cannotmiss|Unrecognized/);
  });

  it('recusa arquivo cujo nome não é o id do caso', () => {
    writeCase('outro-nome.json', validCase);
    expect(() => loadCaseSet(dir)).toThrow(/deve se chamar fi-001-dengue-como-sepse.json/);
  });

  it('recusa caso revisado sem revisor', () => {
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      review: { status: 'physician_reviewed' },
    });
    expect(() => loadCaseSet(dir)).toThrow(/reviewer/);
  });

  it('aceita fontes, proveniência e sondas (gabarito v1)', () => {
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      goldSource: 'guideline_anchored',
      sources: [
        {
          claim: 'Grupo D: expansão de 20 mL/kg em 20 min',
          title: 'Dengue: diagnóstico e manejo clínico',
          publisher: 'Ministério da Saúde',
          year: 2024,
          url: 'https://www.gov.br/saude/dengue',
        },
      ],
      provenance: { originalCaseText: 'Texto antigo do caso.', notes: 'Reescrito na auditoria.' },
      probes: { mustFlag: ['Ibuprofeno 600 mg'], mustNotFlag: ['Paracetamol 750 mg'] },
    });
    expect(loadCaseSet(dir).cases[0]?.sources).toHaveLength(1);
  });

  it('aceita gabarito oficial de prova sem revisor da equipe', () => {
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      goldSource: 'revalida_discursiva',
      review: { status: 'official_exam_key' },
      provenance: { exam: 'Revalida', edition: '2024/2', item: 'discursiva 1' },
    });
    expect(loadCaseSet(dir).cases[0]?.review.status).toBe('official_exam_key');
  });

  it('recusa sonda sem frase que deve ser acusada', () => {
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      probes: { mustFlag: [], mustNotFlag: ['Paracetamol 750 mg'] },
    });
    expect(() => loadCaseSet(dir)).toThrow(/probes\.mustFlag/);
  });

  it('recusa padrão proibido que não é expressão regular válida', () => {
    const expected = validCase.expected as Record<string, unknown>;
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      expected: {
        ...expected,
        forbiddenDefinitiveActions: [
          { id: 'quebrado', description: 'padrão inválido', patterns: ['(('] },
        ],
      },
    });
    expect(() => loadCaseSet(dir)).toThrow(/expressão regular inválida/);
  });
});
