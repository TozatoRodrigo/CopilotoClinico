import { describe, expect, it } from 'vitest';
import { getCalculator } from '../registry';
import { TOOLS } from '../catalog';
import { ANTIDOTES } from './antidotes';
import { CIATOX_GO, DISQUE_INTOXICACAO, telHref } from './ciatox';
import {
  checklistItemKey,
  checklistProgress,
  EXAM_CHECKLIST,
  EXAM_CHECKLIST_TOTAL,
} from './checklist';
import {
  DECONTAMINATION_INTRO,
  DECONTAMINATION_RESULTS,
  DECONTAMINATION_STEPS,
} from './decontamination';
import {
  assessDisposition,
  buildDispositionChartNote,
  checkedCountLabel,
  DISPOSITION_CRITERIA,
  DISPOSITION_NOTES,
} from './disposition';
import { TOX_MODULES } from './modules';
import { TABLE_TABS, TABLE_TAB_IDS } from './tables';
import { TOXIDROME_QUESTIONS, TOXIDROMES } from './toxidromes';

describe('CIATox (CC-323)', () => {
  it('telefones exatamente como no ANY, com o tel: só de dígitos', () => {
    expect(DISQUE_INTOXICACAO.phone).toBe('0800 722 6001');
    expect(telHref(DISQUE_INTOXICACAO)).toBe('tel:08007226001');
    expect(CIATOX_GO.phone).toBe('0800 646 4350');
    expect(telHref(CIATOX_GO)).toBe('tel:08006464350');
  });
});

describe('critérios de destino', () => {
  it('tem os 17 critérios do ANY: 13 de UTI e 4 de enfermaria, ids únicos', () => {
    expect(DISPOSITION_CRITERIA).toHaveLength(17);
    expect(DISPOSITION_CRITERIA.filter(({ level }) => level === 'uti')).toHaveLength(13);
    expect(DISPOSITION_CRITERIA.filter(({ level }) => level === 'enfermaria')).toHaveLength(4);
    const ids = DISPOSITION_CRITERIA.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sem critério: observação / possível alta, em tom neutro', () => {
    expect(assessDisposition([])).toMatchObject({
      disposition: {
        id: 'observacao',
        label: 'Considere observação / possível alta',
        tone: 'neutral',
      },
      uti: 0,
      enfermaria: 0,
    });
  });

  it('qualquer critério de UTI decide, mesmo com os de enfermaria', () => {
    expect(assessDisposition(['laboratorio']).disposition.id).toBe('enfermaria');
    expect(assessDisposition(['laboratorio', 'bav'])).toMatchObject({
      disposition: { id: 'uti', tone: 'critical' },
      uti: 1,
      enfermaria: 1,
    });
  });

  it('ignora id desconhecido e conta no singular e no plural', () => {
    expect(assessDisposition(['nao-existe']).checked).toEqual([]);
    expect(checkedCountLabel(1)).toBe('1 critério marcado');
    expect(checkedCountLabel(0)).toBe('0 critérios marcados');
  });

  it('texto para o prontuário com o destino e os critérios', () => {
    const note = buildDispositionChartNote(assessDisposition(['coma', 'laboratorio']));
    expect(note).toContain(
      'Intoxicação — critérios de destino: Considere UTI (2 critérios marcados).',
    );
    expect(note).toContain('- Rebaixamento de consciência / Coma (UTI)');
    expect(note).toContain('- Alterações laboratoriais que requerem monitorização (enfermaria)');
  });
});

describe('checklist de avaliação', () => {
  it('tem 6 seções (A–F) e 32 itens com chave única', () => {
    expect(EXAM_CHECKLIST.map(({ letter }) => letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(EXAM_CHECKLIST_TOTAL).toBe(32);
    const keys = EXAM_CHECKLIST.flatMap((section) =>
      section.items.map((item) => checklistItemKey(section, item)),
    );
    expect(new Set(keys).size).toBe(32);
  });

  it('conta o que foi marcado, no total e por seção', () => {
    expect(checklistProgress(['neuro:clonus', 'neuro:pupilas', 'odores:alho', 'x:y'])).toEqual({
      checked: 3,
      total: 32,
      bySection: {
        estabilizacao: 0,
        'sinais-vitais': 0,
        neuro: 2,
        pele: 0,
        abdome: 0,
        odores: 1,
      },
    });
  });
});

describe('tabelas de consulta', () => {
  it('tem as abas do ANY menos a de doses (tela própria no CC-324)', () => {
    expect(TABLE_TABS.map(({ id }) => id)).toEqual([...TABLE_TAB_IDS]);
    expect(TABLE_TABS.map(({ label }) => label)).toEqual([
      'Toxíndromes',
      'ECG',
      'Odores',
      'Pupilas',
      'Bombas-relógio',
    ]);
  });
});

describe('roteiro no catálogo', () => {
  it('Toxicologia abre e é achada pelo antídoto', () => {
    const tox = TOOLS.find(({ id }) => id === 'toxicologia');
    expect(tox?.status).toBe('disponivel');
    expect(tox?.synonyms).toContain('Naloxona');
  });

  it('o CIWA-Ar continua apontando para o roteiro', () => {
    expect(getCalculator('ciwa-ar')?.pathway).toEqual({ toolId: 'toxicologia' });
  });

  it('as seções da tela inicial são as 6 do ANY', () => {
    expect(TOX_MODULES.map(({ id }) => id)).toEqual([
      'toxindromes',
      'descontaminacao',
      'destino',
      'antidotos',
      'checklist',
      'tabelas',
    ]);
  });
});

/**
 * Regra de linguagem do ADR-017 aplicada aos textos de conduta do roteiro:
 * sugestão, não ordem. Mesma regra das calculadoras.
 */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva|Dê|Interne)\b/;

describe('linguagem de sugestão', () => {
  const texts = [
    ...Object.values(TOXIDROMES).map(({ treatment }) => treatment),
    ...TOXIDROME_QUESTIONS.map(({ hint }) => hint),
    ...DECONTAMINATION_STEPS.map(({ hint }) => hint),
    ...Object.values(DECONTAMINATION_RESULTS).flatMap(({ title, text }) => [title, text]),
    DECONTAMINATION_INTRO.caution,
    ...Object.values(DISPOSITION_NOTES).map(({ text }) => text),
    ...ANTIDOTES.flatMap(({ sections, warnings, infos }) => [
      ...sections.flatMap(({ lines }) => lines),
      ...warnings,
      ...infos,
    ]),
    ...TABLE_TABS.flatMap(({ blocks }) =>
      blocks.flatMap((block) => (block.kind === 'note' ? [block.text] : [])),
    ),
  ];

  it.each(texts)('%s', (text) => {
    expect(text).not.toMatch(IMPERATIVE_START);
    expect(text).not.toMatch(/imediatamente/i);
    expect(text).not.toMatch(/\bdar naloxona|INTERNAR\b|Recomenda-se contatar/);
  });
});
