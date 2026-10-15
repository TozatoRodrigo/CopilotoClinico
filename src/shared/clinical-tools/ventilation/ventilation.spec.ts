import { describe, expect, it } from 'vitest';
import { searchTools } from '../catalog';
import { RESULT_TONES } from '../tone';
import {
  AIRWAY_RESISTANCE,
  PREDICTED_BODY_WEIGHT,
  SF_RATIO,
  STATIC_COMPLIANCE,
  VENTILATION_CALCULATIONS,
} from './calculations';
import { VENTILATION_PROVENANCE } from './content';
import {
  buildVentilationChartNote,
  evaluateVentilation,
  formatReading,
  usualRangeWarning,
} from './evaluate';
import {
  appendHacorReassessment,
  buildHacorChartNote,
  clockTime,
  evaluateHacor,
  HACOR,
  HACOR_PHASE_ACTION,
  hacorBand,
  hacorTrend,
  startHacorHistory,
} from './hacor';
import { SDRA_GLOBAL_2024_CHANGES, SDRA_SEVERITY } from './sdra';
import { VENTILATION_SECTIONS } from './types';

/**
 * Regra de linguagem do ADR-017 (a mesma do registro de calculadoras, com os
 * verbos de ordem que apareciam no VM Guide do ANY).
 */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva|Prepare|Reavalie|Mantenha|Investigue|Otimize|Reduza|Monitore|Avalie)\b/;

function suggestions(): string[] {
  const bandActions = VENTILATION_CALCULATIONS.flatMap(({ interpretation }) =>
    interpretation ? [...interpretation.bands, interpretation.otherwise].map((b) => b.action) : [],
  );
  const hacor = [...HACOR.interpretation.bands, HACOR.interpretation.otherwise].map(
    (band) => band.action,
  );
  const phases = Object.values(HACOR_PHASE_ACTION).flatMap((actions) => Object.values(actions));
  return [...bandActions, ...hacor, ...phases].filter((text) => text !== '');
}

describe('contas de ventilação (definição)', () => {
  it('são as 14 do VM Guide, sem id repetido e em seções conhecidas', () => {
    expect(VENTILATION_CALCULATIONS).toHaveLength(14);
    const ids = VENTILATION_CALCULATIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set<string>(VENTILATION_SECTIONS.map(({ id }) => id));
    for (const calculation of VENTILATION_CALCULATIONS) {
      expect(sections.has(calculation.section)).toBe(true);
    }
  });

  it.each(VENTILATION_CALCULATIONS.map((calculation) => [calculation.id, calculation] as const))(
    '%s: campos com faixa, unidade e aviso dentro da faixa aceita',
    (_id, calculation) => {
      const ids = calculation.inputs.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const input of calculation.inputs) {
        expect(input.min).toBeLessThan(input.max);
        expect(input.unit.trim()).not.toBe('');
        if (input.usual) {
          // O aviso só faz sentido se der para chegar nele sem cair no erro de faixa.
          expect(input.min).toBeLessThanOrEqual(input.usual.min);
          expect(input.max).toBeGreaterThanOrEqual(input.usual.max);
        }
      }
      for (const check of calculation.checks ?? []) {
        for (const field of check.fields) expect(ids).toContain(field);
      }
    },
  );

  it('faixas em ordem crescente, com tom válido e rótulo', () => {
    for (const { interpretation } of VENTILATION_CALCULATIONS) {
      if (!interpretation) continue;
      const { bands, otherwise } = interpretation;
      for (let index = 1; index < bands.length; index += 1) {
        expect(bands[index]?.upTo.value).toBeGreaterThanOrEqual(bands[index - 1]?.upTo.value ?? 0);
      }
      for (const band of [...bands, otherwise]) {
        expect(RESULT_TONES).toContain(band.tone);
        expect(band.label.trim()).not.toBe('');
      }
    }
  });

  it('sugere em vez de mandar', () => {
    for (const text of suggestions()) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('cada conta e o HACOR acham a ferramenta na busca do hub e do ⌘K', () => {
    for (const { id, aliases } of [...VENTILATION_CALCULATIONS, HACOR]) {
      const found = aliases.some((alias) =>
        searchTools(alias).some(
          (result) => result.kind === 'tool' && result.tool.id === 'ventilacao-mecanica',
        ),
      );
      expect(found, id).toBe(true);
    }
  });

  it('traz procedência com versão e revisão', () => {
    expect(VENTILATION_PROVENANCE.source).toMatch(/ANY App v4/);
    expect(VENTILATION_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(VENTILATION_PROVENANCE.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(HACOR.provenance).toBe(VENTILATION_PROVENANCE);
  });
});

describe('evaluateVentilation', () => {
  it('lista o que falta, pelo rótulo, sem calcular', () => {
    const result = evaluateVentilation(PREDICTED_BODY_WEIGHT, { inputs: { altura: '170' } });
    expect(result).toMatchObject({ status: 'pending', missing: ['Sexo'] });
  });

  it('recusa valor fora da faixa aceita e não calcula', () => {
    const result = evaluateVentilation(AIRWAY_RESISTANCE, {
      inputs: { ppico: '150', ppausa: '20', fluxo: '60' },
    });
    expect(result.status).toBe('pending');
    expect(result.status === 'pending' && result.errors.ppico?.kind).toBe('out-of-range');
  });

  it('só confere as regras entre campos com os campos válidos', () => {
    const empty = evaluateVentilation(STATIC_COMPLIANCE, { inputs: { ppausa: '5', peep: '10' } });
    expect(empty.status === 'pending' && empty.failedChecks).toEqual([]);
    const crossed = evaluateVentilation(STATIC_COMPLIANCE, {
      inputs: { vc: '400', ppausa: '5', peep: '10' },
    });
    expect(
      crossed.status === 'pending' && crossed.failedChecks.map(({ message }) => message),
    ).toEqual(['A pressão de platô precisa ser maior que a PEEP.']);
  });

  it('calcula o peso predito e o volume corrente pelo peso predito', () => {
    const result = evaluateVentilation(PREDICTED_BODY_WEIGHT, {
      choices: { sexo: 'feminino' },
      inputs: { altura: '160' },
    });
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    // 45,5 + 0,91 × (160 − 152,4) = 52,416 kg
    expect(formatReading(result.outcome.reading)).toBe('Peso predito: 52,4 kg');
    expect(result.outcome.details).toEqual([
      'VC 4 mL/kg: 210 mL',
      'VC 6 mL/kg: 314 mL',
      'VC 8 mL/kg: 419 mL',
    ]);
    expect(result.outcome.band).toBeNull();
  });

  it('S/F com SpO₂ acima de 97%: sem número, com a explicação', () => {
    const result = evaluateVentilation(SF_RATIO, { inputs: { spo2: '98', fio2: '40' } });
    expect(result.status === 'complete' && result.outcome).toMatchObject({
      value: null,
      reading: { text: 'SpO₂ > 97%' },
      band: null,
    });
  });

  it('aceita vírgula ou ponto e lê a FiO₂ em porcentagem', () => {
    const comma = evaluateVentilation(SF_RATIO, { inputs: { spo2: '92', fio2: '40,0' } });
    expect(comma.status === 'complete' && formatReading(comma.outcome.reading)).toBe('S/F: 230');
  });
});

describe('usualRangeWarning', () => {
  const ppico = AIRWAY_RESISTANCE.inputs[0];
  if (!ppico) throw new Error('Rva sem campo de pico');

  it('avisa fora da faixa habitual, dentro da aceita', () => {
    expect(usualRangeWarning(ppico, '61')).toBe('Valor fora da faixa habitual (5-60 cmH₂O)');
    expect(usualRangeWarning(ppico, '4,5')).toBe('Valor fora da faixa habitual (5-60 cmH₂O)');
  });

  it('não avisa nas bordas (como no ANY), nem com valor inválido ou fora da faixa aceita', () => {
    expect(usualRangeWarning(ppico, '5')).toBeNull();
    expect(usualRangeWarning(ppico, '60')).toBeNull();
    expect(usualRangeWarning(ppico, '')).toBeNull();
    expect(usualRangeWarning(ppico, 'abc')).toBeNull();
    expect(usualRangeWarning(ppico, '150')).toBeNull();
  });
});

describe('formatReading e prontuário', () => {
  it('junta rótulo, valor e unidade como o ANY', () => {
    expect(formatReading({ label: 'IA', text: '25,0', unit: '%' })).toBe('IA: 25,0%');
    expect(formatReading({ label: 'P/F', text: '200', unit: '' })).toBe('P/F: 200');
    expect(formatReading({ label: 'Rva', text: '16,7', unit: 'cmH₂O/L/s' })).toBe(
      'Rva: 16,7 cmH₂O/L/s',
    );
  });

  it('monta o texto para o prontuário com faixa, campos, sugestão e sem dado de paciente', () => {
    const result = evaluateVentilation(AIRWAY_RESISTANCE, {
      inputs: { ppico: '35', ppausa: '20', fluxo: '60' },
    });
    if (result.status !== 'complete') throw new Error('Rva incompleta');
    expect(buildVentilationChartNote(AIRWAY_RESISTANCE, result)).toBe(
      [
        'Resistência de vias aéreas (Rva): Rva: 15,0 cmH₂O/L/s — Elevada.',
        '- Pressão de pico: 35 cmH₂O',
        '- Pressão de platô (pausa): 20 cmH₂O',
        '- Fluxo inspiratório: 60 L/min',
        'Sugestão: Considere broncoespasmo, secreções ou tubo.',
      ].join('\n'),
    );
  });
});

describe('HACOR', () => {
  it('soma de 0 a 25 e classifica alto risco a partir de 5', () => {
    expect(hacorBand(4).id).toBe('baixo-risco');
    expect(hacorBand(5).id).toBe('alto-risco');
    expect(hacorBand(25).tone).toBe('critical');
    const result = evaluateHacor({
      items: { fc: 'sim', ph: '7-30-a-7-34', gcs: '15', pf: 'ge-201', fr: 'le-30' },
    });
    expect(result.status === 'complete' && result.value).toBe(3);
  });

  it('pede todas as respostas antes de somar', () => {
    expect(evaluateHacor({ items: { fc: 'sim' } })).toMatchObject({ status: 'pending' });
  });

  it('tem ação para cada fase e faixa', () => {
    expect(HACOR_PHASE_ACTION.inicio['alto-risco']).toMatch(/IOT/);
    expect(HACOR_PHASE_ACTION.reavaliacao['alto-risco']).toMatch(/intubação/);
  });

  it('registra T0 e reavaliações de hora em hora, como o ANY', () => {
    const t0 = startHacorHistory(6, '10:00');
    const later = appendHacorReassessment(appendHacorReassessment(t0, 4, '11:00'), 3, '12:00');
    expect(later.map(({ label }) => label)).toEqual(['T0', 'T1h', 'T2h']);
    // Reavaliar sem T0 (direto pelo "Reavaliar VNI"): o ANY rotula a primeira como "T0h".
    expect(appendHacorReassessment([], 5, '10:00')[0]?.label).toBe('T0h');
  });

  it('compara a tendência pelo score', () => {
    expect(hacorTrend(7, 4).id).toBe('melhora');
    expect(hacorTrend(4, 7).id).toBe('piora');
    expect(hacorTrend(4, 4)).toMatchObject({ id: 'estavel', label: 'estável', tone: 'attention' });
  });

  it('monta o texto para o prontuário com a sugestão da fase e o histórico, sem a hora', () => {
    const result = evaluateHacor({
      items: { fc: 'sim', ph: '7-30-a-7-34', gcs: '13-a-14', pf: '176-a-200', fr: 'le-30' },
    });
    if (result.status !== 'complete') throw new Error('HACOR incompleto');
    const note = buildHacorChartNote('reavaliacao', result, [
      { label: 'T0', time: '10:00', score: 9 },
      { label: 'T1h', time: '11:00', score: 7 },
    ]);
    expect(note.split('\n')).toEqual([
      'HACOR score (falha de VNI): 7 pontos — Alto risco de falha.',
      '- FC ≥ 120 bpm: Sim (+1)',
      '- pH: 7,30-7,34 (+2)',
      '- Glasgow (GCS): 13-14 (+2)',
      '- PaO₂/FiO₂: 176-200 (+2)',
      '- Frequência respiratória (irpm): ≤ 30',
      'Sugestão: Considere intubação orotraqueal.',
      'Histórico: T0 9 (alto risco); T1h 7 (alto risco)',
      `Referência: ${HACOR.reference.citation}`,
    ]);
    expect(note).not.toMatch(/10:00|11:00/);
  });

  it('registra a hora como HH:MM', () => {
    expect(clockTime(new Date(2026, 9, 15, 8, 5))).toBe('08:05');
  });
});

describe('SDRA (Global 2024)', () => {
  it('tem as três gravidades e as novidades do ANY', () => {
    expect(SDRA_SEVERITY.map(({ severity }) => severity)).toEqual(['Leve', 'Moderada', 'Grave']);
    expect(SDRA_SEVERITY.map(({ tone }) => tone)).toEqual(['neutral', 'attention', 'critical']);
    expect(SDRA_GLOBAL_2024_CHANGES).toHaveLength(4);
  });
});
