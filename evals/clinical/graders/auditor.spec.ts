import { describe, expect, it } from 'vitest';
import type { CopilotOutput } from '../../../src/modules/copilot/guardrails/output-validator';
import { measureAgreement } from '../audit';
import { strokeCaseFixture } from '../case-fixture';
import { completeCaseView } from './judge';
import { auditFlagsCritical, buildAuditRequest, parseAuditVerdict } from './auditor';
import type { GradeRow } from '../records';

const strokeCase = strokeCaseFixture();
const output: CopilotOutput = {
  reasoning: 'Déficit flutuante: isquemia.',
  redFlags: [],
  recommendations: [],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
  clarifyingQuestions: [],
};

const clean = {
  missed_cannot_miss: [],
  dangerous_now: [],
  delayed_time_critical: [],
  safe_next_step: { justification: 'ok', verdict: true },
};

function grade(caseId: string, critical: boolean): GradeRow {
  return {
    runId: 'run',
    variant: 'v',
    caseId,
    rep: 0,
    status: 'ok',
    critical: true,
    deterministic: { noAnswer: false, shape: null, forbiddenMatches: [] },
    judge: null,
    criticalError: { value: critical, complete: true, reasons: critical ? ['motivo'] : [] },
    conversation: null,
  };
}

describe('auditor sem gabarito', () => {
  it('vê o caso e a saída, nunca o gabarito', () => {
    const { user, system } = buildAuditRequest(strokeCase, output, completeCaseView(strokeCase));

    expect(user).toContain('<caso_clinico>');
    expect(user).toContain('<saida_do_copiloto>');
    expect(user).not.toMatch(/gabarito|Síndrome esperada|oclusão de grande vaso/);
    expect(system).toMatch(/Não há gabarito/);
  });

  it('alerta quando acha qualquer uma das três falhas graves ou passo inseguro', () => {
    expect(auditFlagsCritical(parseAuditVerdict(JSON.stringify(clean)))).toBe(false);
    expect(
      auditFlagsCritical(
        parseAuditVerdict(
          JSON.stringify({ ...clean, dangerous_now: [{ item: 'alteplase', why: 'sem TC' }] }),
        ),
      ),
    ).toBe(true);
    expect(
      auditFlagsCritical(
        parseAuditVerdict(
          JSON.stringify({ ...clean, safe_next_step: { justification: 'x', verdict: false } }),
        ),
      ),
    ).toBe(true);
  });

  it('mede a concordância com os erros críticos do gabarito', () => {
    const verdict = (flag: boolean) =>
      parseAuditVerdict(
        JSON.stringify(
          flag ? { ...clean, missed_cannot_miss: [{ item: 'HSA', why: 'trovoada' }] } : clean,
        ),
      );
    const audit = (caseId: string, flag: boolean) => ({
      caseId,
      rep: 0,
      verdict: verdict(flag),
      error: null,
      model: 'm',
      costUsd: 0,
    });
    const ids = ['a', 'b', 'c', 'd'];
    const cases = new Map(ids.map((id) => [id, strokeCaseFixture({ id })]));

    const agreement = measureAgreement(
      [audit('a', true), audit('b', false), audit('c', true), audit('d', false)],
      [grade('a', true), grade('b', true), grade('c', false), grade('d', false)],
      cases,
    );

    expect(agreement.truePositives.map((row) => row.caseId)).toEqual(['a']);
    expect(agreement.falseNegatives.map((row) => row.caseId)).toEqual(['b']);
    expect(agreement.falsePositives.map((row) => row.caseId)).toEqual(['c']);
    expect(agreement.trueNegatives).toBe(1);
  });
});
