import { describe, expect, it } from 'vitest';
import { IV_PREPARATION, KETOFOL_SCREEN, LOW_COOPERATION } from './content';
import { buildSedationChartNote, deriveSedation, type SedationBlock } from './derive';
import {
  INITIAL_SEDATION_STATE,
  sedationReducer,
  type SedationAction,
  type SedationState,
} from './state';

function apply(...actions: SedationAction[]): SedationState {
  return actions.reduce(sedationReducer, INITIAL_SEDATION_STATE);
}

function kinds(blocks: readonly SedationBlock[]): string[] {
  return blocks.map((block) => block.kind);
}

const combativeKetamine: SedationAction[] = [
  { type: 'choose', choice: 'combativo' },
  { type: 'choose-combative-regimen', regimen: 'cetamina' },
];

const ketofolAfterOral: SedationAction[] = [
  { type: 'choose', choice: 'colaborativo' },
  { type: 'choose', choice: 'precisa-sedacao' },
  { type: 'choose', choice: 'vo-insuficiente' },
  { type: 'advance' },
];

describe('deriveSedation', () => {
  it('triagem: só as três opções, sem peso', () => {
    const view = deriveSedation(INITIAL_SEDATION_STATE, '');
    expect(kinds(view.blocks)).toEqual(['choices']);
    expect(view.needsWeight).toBe(false);
    expect(view.next).toBeNull();
    expect(view.final).toBe(false);
  });

  it('pouco colaborativo: VO primeiro sem sedação recente; aviso de sedação insuficiente com', () => {
    const low = apply({ type: 'choose', choice: 'pouco-colaborativo' });
    expect(kinds(deriveSedation(low, '').blocks)).toEqual([
      'notice',
      'recent-sedation',
      'regimen',
      'notice',
      'choices',
    ]);
    const sedated = sedationReducer(low, { type: 'set-recent-sedation', value: true });
    const blocks = deriveSedation(sedated, '').blocks;
    expect(blocks).toContainEqual({ kind: 'notice', notice: LOW_COOPERATION.alreadySedated });
    expect(kinds(blocks)).not.toContain('regimen');
  });

  it('calculadora da cetamina IM só com peso válido na faixa adulta', () => {
    const state = apply(...combativeKetamine);
    const calculator = (weight: string) =>
      deriveSedation(state, weight).blocks.find((block) => block.kind === 'ketamine-calculator');
    expect(deriveSedation(state, '').needsWeight).toBe(true);
    expect(calculator('')).toEqual({ kind: 'ketamine-calculator', dose: null });
    expect(calculator('80')).toEqual({
      kind: 'ketamine-calculator',
      dose: { doseMg: 400, volumeMl: 8 },
    });
    expect(calculator('39,9')).toEqual({ kind: 'ketamine-calculator', dose: null });
    expect(calculator('1.500')).toEqual({ kind: 'ketamine-calculator', dose: null });
    expect(deriveSedation(state, '250').weight.ok).toBe(false);
  });

  it('preparo IV depois da VO: aviso de sedação prévia no lugar da pergunta', () => {
    const state = apply(...ketofolAfterOral.slice(0, 3));
    const blocks = deriveSedation(state, '').blocks;
    expect(blocks).toContainEqual({ kind: 'notice', notice: IV_PREPARATION.oralGiven });
    expect(kinds(blocks)).not.toContain('recent-sedation');
    expect(deriveSedation(state, '').next?.label).toBe('Calcular cetofol');
  });

  it('cetofol: base reduzida depois da VO e doses só com peso', () => {
    const state = apply(...ketofolAfterOral);
    const doses = (weight: string) =>
      deriveSedation(state, weight).blocks.find((block) => block.kind === 'ketofol-doses');
    expect(doses('')).toMatchObject({ basis: KETOFOL_SCREEN.reduced, doses: null });
    expect(doses('70')).toMatchObject({
      basis: KETOFOL_SCREEN.reduced,
      doses: { reduced: true, induction: { mgPerKg: 0.25, doseMg: 17.5, volumeMl: 3.5 } },
    });
  });

  it('cetofol sem sedação prévia: base "Dose padrão, 0,5 mg/kg de cada componente"', () => {
    const state = apply(
      { type: 'choose', choice: 'pouco-colaborativo' },
      { type: 'choose', choice: 'urgente' },
      { type: 'choose', choice: 'com-acesso-iv' },
      { type: 'advance' },
    );
    const block = deriveSedation(state, '').blocks.find((item) => item.kind === 'ketofol-doses');
    expect(block).toMatchObject({
      basis: { tone: 'info', title: 'Dose padrão', lines: ['0,5 mg/kg de cada componente'] },
    });
  });

  it('pós-sedação é final, com os critérios de alta e a retirada da contenção', () => {
    const state = apply(...combativeKetamine, { type: 'choose', choice: 'contencao-suficiente' });
    const view = deriveSedation(state, '');
    expect(view.final).toBe(true);
    expect(view.blocks).toEqual([
      { kind: 'checklist', id: 'alta' },
      { kind: 'checklist', id: 'retirada-contencao' },
    ]);
  });
});

describe('buildSedationChartNote', () => {
  it('nada a copiar antes da primeira escolha', () => {
    expect(buildSedationChartNote(INITIAL_SEDATION_STATE, '70')).toBeNull();
  });

  it('combativo com cetamina: dose pelo peso, sem nome nem horário', () => {
    const note = buildSedationChartNote(apply(...combativeKetamine), '70');
    expect(note).toBe(
      [
        'Sedação procedimental e agitação (roteiro sugerido):',
        '- Grau de colaboração: Combativo / agitação grave',
        '- Contenção química: Cetamina 5 mg/kg IM: 350 mg (7,0 mL de 50 mg/mL)',
        '- Peso: 70,0 kg',
        'Fonte: ANY App v4 · SedaPath.tsx (95c8fba), revisão clínica pendente.',
      ].join('\n'),
    );
  });

  it('VO insuficiente até o cetofol: doses pela metade', () => {
    const note = buildSedationChartNote(apply(...ketofolAfterOral), '70') ?? '';
    expect(note).toContain('- Sedação VO: Midazolam 7,5–15 mg VO ou Clonazepam 0,5–1 mg VO');
    expect(note).toContain('- Resposta à sedação VO: insuficiente');
    expect(note).toContain(
      '- Cetofol 1:1 IV: indução 18 mg de cada (3,5 mL); manutenção 9 mg de cada (1,8 mL), doses reduzidas pela metade (sedação prévia)',
    );
  });

  it('pouco colaborativo não urgente: haloperidol + prometazina e a resposta das 4 h', () => {
    const note =
      buildSedationChartNote(
        apply(
          { type: 'choose', choice: 'pouco-colaborativo' },
          { type: 'set-recent-sedation', value: true },
          { type: 'choose', choice: 'nao-urgente' },
        ),
        '',
      ) ?? '';
    expect(note).toContain('- Sedação nas últimas 4 h: Sim');
    expect(note).toContain('- Urgência: não urgente');
    expect(note).toContain('- Medicação IM: Haloperidol 5 mg + Prometazina 50 mg IM');
    expect(note).not.toContain('Peso');
  });

  it('sem peso válido, a cetamina vai sem dose calculada', () => {
    const note = buildSedationChartNote(apply(...combativeKetamine), '300') ?? '';
    expect(note).toContain('- Contenção química: Cetamina 5 mg/kg IM');
    expect(note).not.toContain('mg (');
  });
});
