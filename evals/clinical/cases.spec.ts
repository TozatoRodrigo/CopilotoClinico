import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { maskPII } from '../../src/modules/copilot/guardrails/pii-filter';
import { EVAL_CASE_DRAFT_PLACEHOLDER } from '../../src/shared/contracts/clinical';
import { scanForInjection } from '../../src/modules/copilot/guardrails/injection-defense';
import { FIELD_INCIDENT_CASES } from '../../tests/fixtures/field-incident-cases';
import { KB_001_SYNTHETIC_CASES } from '../../tests/fixtures/kb-001-synthetic-cases';
import { SYNDROME_GROUPS } from './case.schema';
import { BLIND_CASES_DIR, CASES_DIR, CaseFileError, loadCaseSet, selectCases } from './cases';
import { normalizeForMatching } from './graders/deterministic';

const { cases } = loadCaseSet();
const caseById = new Map(cases.map((clinicalCase) => [clinicalCase.id, clinicalCase]));

describe('gabarito clínico', () => {
  it('carrega todos os arquivos de caso com ids únicos', () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
    expect(new Set(cases.map((clinicalCase) => clinicalCase.id)).size).toBe(cases.length);
  });

  // CC-412: `draftOrigin` é opcional (ausente = escrito sem rascunho de IA) e
  // nenhum caso registra cartão como fonte — os dois conjuntos carregam.
  it('carrega os casos atuais e a prova cega sem exigir rascunho de origem', () => {
    const blind = loadCaseSet(BLIND_CASES_DIR).cases;
    expect(blind.length).toBeGreaterThan(0);
    for (const clinicalCase of [...cases, ...blind]) {
      expect(clinicalCase.goldSource, clinicalCase.id).not.toMatch(/card/);
    }
  });

  it('começa as tags de todo caso pela síndrome de PS', () => {
    for (const clinicalCase of cases) {
      expect(SYNDROME_GROUPS, clinicalCase.id).toContain(clinicalCase.tags[0]);
    }
  });

  it('exige ao menos um diagnóstico de nível crítico em todo caso crítico', () => {
    const critical = cases.filter((clinicalCase) => clinicalCase.critical);
    expect(critical.length).toBeGreaterThan(0);
    for (const clinicalCase of critical) {
      expect(
        clinicalCase.expected.diagnoses.filter((diagnosis) => diagnosis.tier === 'critical').length,
        clinicalCase.id,
      ).toBeGreaterThan(0);
    }
  });

  // Gabarito v2: o afunilamento mede se as perguntas chegam ao dado decisivo;
  // sem fato `key` no roteiro, não há o que medir.
  it('marca ao menos um fato decisivo no roteiro de todo caso com afunilamento', () => {
    const withFunnel = cases.filter((clinicalCase) => clinicalCase.input.funnel);
    expect(withFunnel.length).toBeGreaterThan(0);
    for (const clinicalCase of withFunnel) {
      expect(
        clinicalCase.input.funnel?.script.some((fact) => fact.key),
        clinicalCase.id,
      ).toBe(true);
    }
  });

  it('nunca entrega na abertura do afunilamento o fato decisivo do roteiro', () => {
    for (const clinicalCase of cases) {
      const funnel = clinicalCase.input.funnel;
      if (!funnel) continue;
      const opening = normalizeForMatching(funnel.opening);
      for (const fact of funnel.script.filter((candidate) => candidate.key)) {
        expect(opening, `${clinicalCase.id}: ${fact.id}`).not.toContain(
          normalizeForMatching(fact.text),
        );
      }
    }
  });

  // CC-703 — o rascunho baixado da triagem do feedback já passa no schema,
  // com o que é do curador marcado (texto "A PREENCHER" e, sem síndrome, a
  // tag "a-preencher"). Commitado assim, rodaria sem nada a medir.
  it('não aceita rascunho da triagem com campo ainda a preencher', () => {
    const toFill = new RegExp(`${EVAL_CASE_DRAFT_PLACEHOLDER}|"a-preencher"`, 'i');
    for (const dir of [CASES_DIR, BLIND_CASES_DIR]) {
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
        expect(readFileSync(join(dir, file), 'utf-8'), file).not.toMatch(toFill);
      }
    }
  });

  it('mantém como rascunho todo gabarito ainda não revisado por médico', () => {
    for (const clinicalCase of cases) {
      if (clinicalCase.review.status === 'physician_reviewed') {
        expect(clinicalCase.review.reviewer, clinicalCase.id).toBeDefined();
      }
    }
  });

  // Gabarito v1: o texto do KB-001 que anunciava o dado ausente ("sem
  // informação sobre X, Y, Z") entregava as perguntas ao modelo. Foi reescrito
  // como nota de beira de leito; o original fica em provenance.
  it('traz os 40 casos do KB-001, com o texto do fixture no caso ou na proveniência', () => {
    for (const fixture of KB_001_SYNTHETIC_CASES) {
      const clinicalCase = caseById.get(`kb001-${fixture.id}`);
      expect(clinicalCase, fixture.id).toBeDefined();
      const originalText =
        clinicalCase?.provenance?.originalCaseText ?? clinicalCase?.input.caseText;
      expect(originalText, fixture.id).toBe(fixture.clinicalInput);
      expect(clinicalCase?.goldSource).toBe('kb001_synthetic');
      // O "caminho esperado" saiu no v2; o caso que pedia pergunta continua
      // medindo o dado que falta.
      if (fixture.expectedDecision === 'clarify') {
        expect(clinicalCase?.expected.questions.length, fixture.id).toBeGreaterThan(0);
      }
    }
  });

  it('nunca anuncia no texto do caso o dado que falta', () => {
    const announcesMissingData = /sem informacao|nao informad|sem descricao/;
    for (const clinicalCase of cases) {
      expect(normalizeForMatching(clinicalCase.input.caseText), clinicalCase.id).not.toMatch(
        announcesMissingData,
      );
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

  // Inclui `questions`: desde o gabarito v1 o texto do caso omite o dado que
  // falta em vez de nomeá-lo, então a pergunta esperada também não pode estar lá.
  it('nunca vaza a resposta esperada no texto do caso', () => {
    for (const clinicalCase of cases) {
      const caseText = normalizeForMatching(clinicalCase.input.caseText);
      const expectations = [
        clinicalCase.expected.syndrome,
        ...clinicalCase.expected.diagnoses.map((diagnosis) => diagnosis.text),
        ...clinicalCase.expected.questions,
        ...clinicalCase.expected.actions.map((action) => action.text),
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
  // Vale também para a abertura e o roteiro do afunilamento: as respostas do
  // médico simulado passam pelos mesmos filtros na reanálise.
  it('chega ao modelo exatamente como escrito (sem PII mascarada nem bloqueio de injeção)', () => {
    for (const clinicalCase of cases) {
      const funnel = clinicalCase.input.funnel;
      const texts = [
        clinicalCase.input.caseText,
        ...(funnel ? [funnel.opening, ...funnel.script.map((fact) => fact.text)] : []),
      ];
      for (const text of texts) {
        expect(maskPII(text).hasPII, `${clinicalCase.id}: ${text}`).toBe(false);
        expect(scanForInjection(text).safe, `${clinicalCase.id}: ${text}`).toBe(true);
      }
    }
  });
});

// Prova cega: mesmas regras de formato, ids próprios e nenhum caso em comum
// com o conjunto principal — senão deixa de ser cega.
describe('prova cega (cases-blind)', () => {
  const blind = loadCaseSet(BLIND_CASES_DIR).cases;

  it('usa ids com o prefixo "cega-", sem repetir nenhum id do conjunto principal', () => {
    for (const clinicalCase of blind) {
      expect(clinicalCase.id, clinicalCase.id).toMatch(/^cega-/);
      expect(caseById.has(clinicalCase.id), clinicalCase.id).toBe(false);
    }
  });

  it('nunca vaza a resposta esperada no texto do caso', () => {
    for (const clinicalCase of blind) {
      const caseText = normalizeForMatching(clinicalCase.input.caseText);
      for (const expectation of [
        clinicalCase.expected.syndrome,
        ...clinicalCase.expected.diagnoses.map((diagnosis) => diagnosis.text),
        ...clinicalCase.expected.actions.map((action) => action.text),
      ]) {
        expect(caseText, `${clinicalCase.id}: "${expectation}"`).not.toContain(
          normalizeForMatching(expectation),
        );
      }
    }
  });

  it('chega ao modelo exatamente como escrito (sem PII mascarada nem bloqueio de injeção)', () => {
    for (const clinicalCase of blind) {
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

  const officialProvenance = {
    exam: 'Revalida',
    edition: '2024/2',
    item: 'discursiva 1',
    url: 'https://download.inep.gov.br/revalida/provas_e_gabaritos/exemplo.pdf',
    originalCaseText: 'Enunciado oficial da questão.',
  };

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
      provenance: officialProvenance,
    });
    expect(loadCaseSet(dir).cases[0]?.review.status).toBe('official_exam_key');
  });

  it('recusa gabarito oficial sem a prova, a URL e o texto original', () => {
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      goldSource: 'revalida_discursiva',
      review: { status: 'official_exam_key' },
      provenance: { exam: 'Revalida', edition: '2024/2' },
    });
    expect(() => loadCaseSet(dir)).toThrow(/provenance\.exam, provenance\.url/);
  });

  it('recusa caso crítico sem diagnóstico de nível crítico', () => {
    const expected = validCase.expected as { diagnoses: Array<{ text: string; tier: string }> };
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      critical: true,
      expected: {
        ...expected,
        diagnoses: expected.diagnoses.map((diagnosis) => ({ ...diagnosis, tier: 'important' })),
      },
    });
    expect(() => loadCaseSet(dir)).toThrow(/diagnóstico de nível critical/);
  });

  it('aceita o modo afunilamento e recusa id de fato repetido no roteiro', () => {
    const fact = { id: 'h-picada', kind: 'history', text: 'Pai viu um escorpião.', key: true };
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      input: {
        ...(validCase.input as object),
        funnel: { opening: 'Criança de 4 anos com dor na perna.', script: [fact] },
      },
    });
    expect(loadCaseSet(dir).cases[0]?.input.funnel?.script).toHaveLength(1);

    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      input: {
        ...(validCase.input as object),
        funnel: { opening: 'Criança de 4 anos com dor na perna.', script: [fact, fact] },
      },
    });
    expect(() => loadCaseSet(dir)).toThrow(/ids repetidos em funnel\.script/);
  });

  it('aceita caso fora do portão com motivo', () => {
    writeCase('fi-001-dengue-como-sepse.json', {
      ...validCase,
      excludeFromGate: { reason: 'Gabarito oficial anterior à diretriz vigente.' },
    });
    expect(loadCaseSet(dir).cases[0]?.excludeFromGate?.reason).toMatch(/diretriz/);
  });

  describe('anti-circularidade (CC-412)', () => {
    const draftOrigin = {
      draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceContentSha256: 'a'.repeat(64),
    };

    it.each(['card', 'knowledge_card'])('recusa caso com fonte "%s"', (goldSource) => {
      writeCase('fi-001-dengue-como-sepse.json', { ...validCase, goldSource });
      expect(() => loadCaseSet(dir)).toThrow(/não pode nascer de cartão \(CC-412\)/);
    });

    it('continua recusando fonte desconhecida com a mensagem da lista', () => {
      writeCase('fi-001-dengue-como-sepse.json', { ...validCase, goldSource: 'chatgpt' });
      expect(() => loadCaseSet(dir)).toThrow(/goldSource: Invalid enum value/);
    });

    it('aceita o rascunho de origem de um caso escrito a partir de rascunho de IA', () => {
      writeCase('fi-001-dengue-como-sepse.json', {
        ...validCase,
        goldSource: 'ai_draft',
        draftOrigin,
      });
      expect(loadCaseSet(dir).cases[0]?.draftOrigin).toEqual(draftOrigin);
    });

    it('recusa rascunho de origem sem id válido ou com hash fora do formato', () => {
      writeCase('fi-001-dengue-como-sepse.json', {
        ...validCase,
        draftOrigin: { draftId: 'rascunho-1', sourceContentSha256: 'A'.repeat(64) },
      });
      expect(() => loadCaseSet(dir)).toThrow(
        /draftOrigin\.draftId[\s\S]*draftOrigin\.sourceContentSha256/,
      );
    });
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
