import { describe, expect, it } from 'vitest';
import {
  ACLS_HISTORY_LIMIT,
  addToHistory,
  createAclsHistoryRecord,
  nextReportNumber,
  parseAclsHistory,
  type AclsHistoryRecord,
} from './history';
import { buildAclsReport, medicationSummary } from './report';
import { aclsReducer, INITIAL_ACLS_STATE, type AclsAction, type AclsState } from './session';

// Horário local (o relatório usa o fuso do aparelho): 15/10/2026 14:30:00.
const T0 = new Date(2026, 9, 15, 14, 30, 0).getTime();
const s = (seconds: number) => T0 + seconds * 1000;

function run(actions: readonly AclsAction[], from: AclsState = INITIAL_ACLS_STATE): AclsState {
  return actions.reduce(aclsReducer, from);
}

/** Parada chocável com 2 choques, epinefrina, amiodarona, uma pausa e RCE aos 4:10. */
const ROSC = run([
  { type: 'start', at: s(0) },
  { type: 'select-rhythm', at: s(10), rhythm: 'shockable' },
  { type: 'register-shock', at: s(15) },
  { type: 'register-medication', at: s(60), medication: 'epinefrina' },
  { type: 'complete-cycle', at: s(130) },
  { type: 'check-rhythm', at: s(136), result: 'shockable', etco2: 22 },
  { type: 'register-shock', at: s(140) },
  { type: 'register-medication', at: s(150), medication: 'amiodarona-300' },
  { type: 'toggle-compression-pause', at: s(200) },
  { type: 'toggle-compression-pause', at: s(212) },
  { type: 'register-medication', at: s(220), medication: 'epinefrina' },
  { type: 'complete-cycle', at: s(256) },
  { type: 'check-rhythm', at: s(250 + 10), result: 'rosc' },
]);

describe('buildAclsReport — relatório para o prontuário (critério 1 do CC-314)', () => {
  it('tem horários, choques, medicações e desfecho', () => {
    expect(buildAclsReport(ROSC, 3)).toBe(
      [
        'RELATÓRIO DE PCR — Copiloto Clínico (ACLS)',
        'Atendimento #3',
        'Data: 15/10/2026 | Início: 14:30',
        'Ritmo inicial: FV/TV sem pulso',
        'Tempo total: 4:20',
        'Ciclos de RCP: 2',
        'Choques: 2',
        'Medicações: Epinefrina 1 mg IV/IO ×2; Amiodarona 300 mg IV ×1',
        'Desfecho: RCE obtido',
        'Tempo total de compressão: 4:08',
        'Tempo em pausa: 0:12',
        'Fração de compressão torácica: 95%',
        '',
        'LINHA DO TEMPO:',
        '  0:00 (14:30) — Código iniciado',
        '  0:10 (14:30) — FV/TV sem pulso',
        '  0:15 (14:30) — Choque 1',
        '  1:00 (14:31) — Epinefrina 1 mg IV/IO',
        '  2:10 (14:32) — Ciclo 1 completo',
        '  2:16 (14:32) — ETCO2: 22 mmHg',
        '  2:16 (14:32) — Ritmo chocável',
        '  2:20 (14:32) — Choque 2',
        '  2:30 (14:32) — Amiodarona 300 mg IV',
        '  3:20 (14:33) — Pausa nas compressões',
        '  3:32 (14:33) — Compressões retomadas (pausa: 12s)',
        '  3:40 (14:33) — Epinefrina 1 mg IV/IO',
        '  4:16 (14:34) — Ciclo 2 completo',
        '  4:20 (14:34) — RCE obtido',
        'Fim: 14:34',
        '',
        'AHA 2025 | Copiloto Clínico · conteúdo ACLS v1.0.0',
      ].join('\n'),
    );
  });

  it('marca a FCT abaixo da meta e o óbito', () => {
    const death = run([
      { type: 'start', at: s(0) },
      { type: 'select-rhythm', at: s(5), rhythm: 'nonshockable' },
      { type: 'toggle-compression-pause', at: s(10) },
      { type: 'toggle-compression-pause', at: s(60) },
      { type: 'complete-cycle', at: s(125) },
      { type: 'check-rhythm', at: s(130), result: 'death' },
    ]);
    const report = buildAclsReport(death, 1) ?? '';
    expect(report).toContain('Fração de compressão torácica: 62% (meta: acima de 80%)');
    expect(report).toContain('Desfecho: Óbito');
    expect(report).toContain('Medicações: nenhuma');
    expect(report).toContain('Ritmo inicial: AESP/Assistolia');
  });

  it('não existe antes do fim da parada', () => {
    expect(buildAclsReport(INITIAL_ACLS_STATE, 1)).toBeNull();
    expect(buildAclsReport(run([{ type: 'start', at: s(0) }]), 1)).toBeNull();
  });

  it('não muda se for aberto depois (o ANY contava até a hora de abrir)', () => {
    expect(buildAclsReport(ROSC, 1)).toContain('Tempo total: 4:20');
  });

  it('não traz identificação de paciente', () => {
    const report = buildAclsReport(ROSC, 1) ?? '';
    expect(report).not.toMatch(/paciente|nome|cpf|prontuário nº/i);
  });
});

describe('medicationSummary', () => {
  it('lista na ordem da tela, com a contagem', () => {
    expect(medicationSummary(ROSC)).toBe('Epinefrina 1 mg IV/IO ×2; Amiodarona 300 mg IV ×1');
  });
});

describe('checklist pós-RCE e número do relatório', () => {
  it('marca e desmarca itens só depois do RCE', () => {
    const checked = run([{ type: 'toggle-rosc-item', item: 'ecg' }], ROSC);
    expect(checked.roscChecklist).toEqual(['ecg']);
    expect(run([{ type: 'toggle-rosc-item', item: 'ecg' }], checked).roscChecklist).toEqual([]);

    const running = run([{ type: 'start', at: s(0) }]);
    expect(aclsReducer(running, { type: 'toggle-rosc-item', item: 'ecg' })).toBe(running);
  });

  it('guarda o número do relatório uma vez só', () => {
    const recorded = run([{ type: 'record-report', number: 4, recordId: 'a' }], ROSC);
    expect(recorded.report).toEqual({ number: 4, recordId: 'a' });
    expect(aclsReducer(recorded, { type: 'record-report', number: 5, recordId: 'b' })).toBe(
      recorded,
    );
  });
});

describe('histórico no aparelho', () => {
  const record = createAclsHistoryRecord(ROSC, { id: 'r1', number: 1 }) as AclsHistoryRecord;

  it('resume a parada com o relatório', () => {
    expect(record).toMatchObject({
      id: 'r1',
      number: 1,
      date: '15/10/2026',
      startTime: '14:30',
      endTime: '14:34',
      initialRhythm: 'FV/TV sem pulso',
      outcome: 'RCE',
      cycles: 2,
      shocks: 2,
      durationSeconds: 260,
    });
    expect(record.report).toBe(buildAclsReport(ROSC, 1));
  });

  it('numera a partir do maior e não repete número depois de apagar', () => {
    expect(nextReportNumber([])).toBe(1);
    expect(
      nextReportNumber([
        { ...record, number: 2 },
        { ...record, number: 7 },
      ]),
    ).toBe(8);
  });

  it(`guarda no máximo ${ACLS_HISTORY_LIMIT}, tirando o mais antigo`, () => {
    let history: AclsHistoryRecord[] = [];
    for (let index = 1; index <= ACLS_HISTORY_LIMIT + 3; index += 1) {
      history = addToHistory(history, { ...record, id: `r${index}`, number: index });
    }
    expect(history).toHaveLength(ACLS_HISTORY_LIMIT);
    expect(history[0]?.number).toBe(4);
    expect(history.at(-1)?.number).toBe(ACLS_HISTORY_LIMIT + 3);
  });

  it('lê o salvo descartando entrada estranha', () => {
    expect(parseAclsHistory([record, { id: 'x' }, null, 'texto'])).toEqual([record]);
    expect(parseAclsHistory({ not: 'array' })).toEqual([]);
  });

  it('não cria registro de parada em curso', () => {
    expect(
      createAclsHistoryRecord(run([{ type: 'start', at: s(0) }]), { id: 'x', number: 1 }),
    ).toBeNull();
  });
});
