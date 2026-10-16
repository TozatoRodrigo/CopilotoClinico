import { describe, expect, it } from 'vitest';
import {
  buildMentoringCaseSnapshot,
  maskFreeTextForMentor,
  pickLatestPlan,
  readStoredSnapshot,
} from './mentoring-snapshot';

const CPF = '529.982.247-25';
const PHONE = '(11) 98765-4321';
const EMAIL = 'filha.paciente@example.com';
const PATIENT_REF = 'PRONT-88231';

/** Um plano com PII escapando em todo campo de texto. */
const rawOutput = {
  reasoning: `Raciocínio interno citando CPF ${CPF}.`,
  differentials: [
    { hypothesis: `Sepse (paciente ${PATIENT_REF})`, cannotMiss: true, whyConsider: 'x' },
    { hypothesis: 'Dengue com sinais de alarme', cannotMiss: false, whyConsider: 'y' },
  ],
  redFlags: [{ finding: `Hipotensão; contato ${PHONE}`, severity: 'critical', action: 'x' }],
  recommendations: [
    {
      action: `Ligar para a família em ${EMAIL}`,
      rationale: 'x',
      preliminary: true,
      sourceText: 'Trecho da diretriz que não deve sair',
    },
    { action: 'Coletar hemoculturas', rationale: 'x', preliminary: false },
  ],
  clarifyingQuestions: [{ id: 'q1', question: `Confirmar nascimento: 12/03/1960?` }],
  uncertainty: false,
};

const interaction = {
  id: 'int-1',
  inputRedacted: `Paciente ${PATIENT_REF}, CPF ${CPF}, febre há 4 dias.`,
  rawOutput,
  createdAt: new Date('2026-10-14T10:00:00.000Z'),
};

function snapshot() {
  const latest = pickLatestPlan([interaction]);
  if (!latest) throw new Error('expected a plan');
  return buildMentoringCaseSnapshot({
    vertical: 'general',
    context: { hasCT: true, isSus: true, hasLab: false, hasICU: false },
    patientRef: PATIENT_REF,
    interaction: latest.interaction,
    output: latest.output,
  });
}

describe('buildMentoringCaseSnapshot', () => {
  it('masks PII and the patientRef in every text that goes to the mentors', () => {
    const sent = JSON.stringify(snapshot());

    expect(sent).not.toContain(CPF);
    expect(sent).not.toContain(PHONE);
    expect(sent).not.toContain(EMAIL);
    expect(sent).not.toContain(PATIENT_REF);
    expect(sent).not.toContain('12/03/1960');
    expect(sent).toContain('[REDACTED_CPF]');
    expect(sent).toContain('[PATIENT_REF_REDACTED]');
    expect(sent).toContain('[REDACTED_PHONE]');
    expect(sent).toContain('[REDACTED_EMAIL]');
    expect(sent).toContain('[REDACTED_DATE]');
  });

  it('keeps the plan the mentor needs and leaves sources and internal reasoning out', () => {
    const result = snapshot();

    expect(result).toEqual({
      vertical: 'general',
      context: { hasCT: true, isSus: true, hasLab: false, hasICU: false },
      caseText: 'Paciente [PATIENT_REF_REDACTED], CPF [REDACTED_CPF], febre há 4 dias.',
      analysisCreatedAt: '2026-10-14T10:00:00.000Z',
      plan: {
        mainHypothesis: 'Sepse (paciente [PATIENT_REF_REDACTED])',
        differentials: [
          { hypothesis: 'Sepse (paciente [PATIENT_REF_REDACTED])', cannotMiss: true },
          { hypothesis: 'Dengue com sinais de alarme', cannotMiss: false },
        ],
        redFlags: [{ finding: 'Hipotensão; contato [REDACTED_PHONE]', severity: 'critical' }],
        recommendations: [
          { action: 'Ligar para a família em [REDACTED_EMAIL]', preliminary: true },
          { action: 'Coletar hemoculturas', preliminary: false },
        ],
        pendingQuestions: ['Confirmar nascimento: [REDACTED_DATE]?'],
        uncertainty: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('Raciocínio interno');
    expect(JSON.stringify(result)).not.toContain('Trecho da diretriz');
  });

  it('drops a context that is not the encounter context shape', () => {
    const latest = pickLatestPlan([interaction]);
    if (!latest) throw new Error('expected a plan');
    const result = buildMentoringCaseSnapshot({
      vertical: 'trauma',
      context: null,
      patientRef: null,
      interaction: { ...latest.interaction, inputRedacted: null },
      output: latest.output,
    });
    expect(result.context).toBeNull();
    expect(result.caseText).toBeNull();
  });
});

describe('pickLatestPlan', () => {
  it('skips validation-failure rows and takes the newest real plan', () => {
    const failure = {
      ...interaction,
      id: 'int-failed',
      rawOutput: { raw: '{...}', validationErrors: ['x'] },
    };
    expect(pickLatestPlan([failure, interaction])?.interaction.id).toBe('int-1');
  });

  it('returns null when no analysis produced a plan', () => {
    expect(pickLatestPlan([])).toBeNull();
    expect(pickLatestPlan([{ ...interaction, rawOutput: null }])).toBeNull();
  });
});

describe('maskFreeTextForMentor', () => {
  it('masks the physician question and turns blank into null', () => {
    expect(maskFreeTextForMentor(`  Paciente ${PATIENT_REF}, tel ${PHONE}  `, PATIENT_REF)).toBe(
      'Paciente [PATIENT_REF_REDACTED], tel [REDACTED_PHONE]',
    );
    expect(maskFreeTextForMentor('   ', PATIENT_REF)).toBeNull();
    expect(maskFreeTextForMentor(undefined, null)).toBeNull();
  });
});

describe('readStoredSnapshot', () => {
  it('round-trips what was stored', () => {
    const stored = JSON.parse(JSON.stringify(snapshot()));
    expect(readStoredSnapshot(stored)).toEqual(snapshot());
  });

  it('never breaks the mentor screen on a malformed row', () => {
    expect(readStoredSnapshot('garbage')).toEqual({
      vertical: '',
      context: null,
      caseText: null,
      analysisCreatedAt: null,
      plan: {
        mainHypothesis: null,
        differentials: [],
        redFlags: [],
        recommendations: [],
        pendingQuestions: [],
        uncertainty: false,
      },
    });
  });
});
