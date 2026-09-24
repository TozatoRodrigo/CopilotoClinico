import { describe, expect, it } from 'vitest';
import {
  buildClassificationMessages,
  heuristicClassification,
  parseClassification,
} from './official-classification';

const valid = {
  careSetting: 'agudo',
  population: 'adulto',
  specialty: 'toxicologia',
  cenarios: ['intoxicacao_exogena'],
  rationale: 'Orienta soroterapia no atendimento de urgência.',
};

describe('parseClassification', () => {
  it('aceita JSON válido e marca a origem', () => {
    expect(parseClassification(JSON.stringify(valid), 'model-x')).toEqual({
      ...valid,
      source: 'llm',
      model: 'model-x',
    });
  });

  it('aceita JSON dentro de bloco de código', () => {
    const result = parseClassification('```json\n' + JSON.stringify(valid) + '\n```', 'm');

    expect(result).toMatchObject({ careSetting: 'agudo' });
  });

  it('descarta cenário fora do vocabulário sem invalidar o resto', () => {
    const result = parseClassification(
      JSON.stringify({
        ...valid,
        cenarios: ['intoxicacao_exogena', 'picada_de_cobra', 'intoxicacao_exogena'],
      }),
      'm',
    );

    expect(result).toMatchObject({ cenarios: ['intoxicacao_exogena'] });
  });

  it('rejeita especialidade fora da lista', () => {
    const result = parseClassification(JSON.stringify({ ...valid, specialty: 'cardio' }), 'm');

    expect(result).toHaveProperty('error');
  });

  it('rejeita resposta que não é JSON', () => {
    expect(parseClassification('Classificação: agudo', 'm')).toEqual({
      error: 'resposta não é JSON',
    });
  });
});

describe('heuristicClassification', () => {
  it('marca como agudo pelo título', () => {
    expect(heuristicClassification({ kind: 'pcdt', title: 'Acidentes Ofídicos' })).toMatchObject({
      careSetting: 'agudo',
      source: 'heuristic',
      cenarios: [],
    });
  });

  it('é conservadora na dúvida: indefinido, sem cenário', () => {
    expect(heuristicClassification({ kind: 'pcdt', title: 'Doença de Gaucher' })).toMatchObject({
      careSetting: 'indefinido',
      cenarios: [],
    });
  });

  it('DDT é oncologia crônica; título pediátrico marca a população', () => {
    expect(
      heuristicClassification({
        kind: 'ddt',
        title: 'Leucemia Mieloide Aguda - Crianças e Adolescentes',
      }),
    ).toMatchObject({ careSetting: 'agudo', population: 'pediatrico', specialty: 'oncologia' });
  });
});

describe('buildClassificationMessages', () => {
  it('passa título, CIDs, seções e a introdução, e restringe os cenários à lista', () => {
    const [system, user] = buildClassificationMessages({
      kind: 'pcdt',
      kindLabel: 'PCDT',
      title: 'Asma',
      document: {
        sectioning: 'structured',
        cid10: ['J45.0'],
        introduction: 'A asma é uma doença inflamatória crônica.',
        sections: [{ number: 7, title: 'TRATAMENTO', text: '', included: true }],
      },
    });

    expect(system!.content).toContain('crise_asmatica');
    expect(system!.content).toContain('Lista vazia é a resposta correta');
    expect(user!.content).toContain('Título: Asma');
    expect(user!.content).toContain('CID-10: J45.0');
    expect(user!.content).toContain('Seções: TRATAMENTO');
    expect(user!.content).toContain('A asma é uma doença inflamatória crônica.');
  });
});
