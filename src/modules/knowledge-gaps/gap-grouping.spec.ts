import { describe, expect, it } from 'vitest';
import {
  cardCoversGroup,
  findMatchingGroup,
  gapTerms,
  syndromesCompatible,
  termsMatch,
  type GroupCandidate,
} from './gap-grouping';

function group(overrides: Partial<GroupCandidate> & { id: string }): GroupCandidate {
  return {
    syndrome: null,
    signature: [],
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

/**
 * CC-409 — agrupamento determinístico: o que junta duas lacunas é o tema
 * (termos sem acento, sem palavra genérica, cortados no radical) e a
 * síndrome. A mesma entrada cai sempre no mesmo grupo.
 */
describe('gapTerms', () => {
  it('normaliza acento, caixa e radical, e tira palavra genérica, número e marca de PII', () => {
    expect(
      gapTerms(['Dose de AMOXICILINA na otite média aguda — criança de 20 kg [REDACTED_CPF]']),
    ).toEqual(['aguda', 'amoxic', 'media', 'otite']);
  });

  it('junta as consultas sem repetir termo, em ordem alfabética', () => {
    expect(
      gapTerms(['cetoacidose diabética insulina', 'Cetoacidose: reposição de potássio']),
    ).toEqual(['cetoac', 'diabet', 'insuli', 'potass', 'reposi']);
  });

  it('a mesma dúvida escrita de outro jeito dá os mesmos termos', () => {
    expect(gapTerms(['qual a dose de ceftriaxona na meningite bacteriana?'])).toEqual(
      gapTerms(['Meningite bacteriana: ceftriaxona (posologia)']),
    );
  });

  it('sem consulta, sem termos', () => {
    expect(gapTerms([])).toEqual([]);
    expect(gapTerms(['dose de', '  '])).toEqual([]);
  });
});

describe('syndromesCompatible', () => {
  it('só duas síndromes definidas e diferentes separam; "outro" e null não separam', () => {
    expect(syndromesCompatible('febre', 'febre')).toBe(true);
    expect(syndromesCompatible('febre', 'dor-toracica')).toBe(false);
    expect(syndromesCompatible('febre', null)).toBe(true);
    expect(syndromesCompatible('outro', 'dor-toracica')).toBe(true);
  });
});

describe('termsMatch', () => {
  it('pede dois termos em comum e metade do menor conjunto', () => {
    expect(
      termsMatch(['cetoac', 'diabet', 'insuli'], ['cetoac', 'insuli', 'potass', 'reposi']),
    ).toBe(true);
    expect(
      termsMatch(
        ['cetoac', 'diabet', 'insuli', 'potass'],
        ['cetoac', 'hipogl', 'glicos', 'insuli', 'bomba', 'infusa'],
      ),
    ).toBe(true);
    expect(termsMatch(['dengue', 'hidrat'], ['sepse', 'hidrat', 'antibi'])).toBe(false);
  });

  it('com um termo só, basta ele: "amoxicilina" cai no grupo da amoxicilina', () => {
    expect(termsMatch(['amoxic'], ['amoxic', 'otite'])).toBe(true);
    expect(termsMatch(['amoxic'], ['azitro', 'otite'])).toBe(false);
  });

  it('nada junta com conjunto vazio', () => {
    expect(termsMatch([], ['amoxic'])).toBe(false);
  });
});

describe('findMatchingGroup', () => {
  const ketoacidosis = group({
    id: 'g-cad',
    syndrome: 'disturbio-glicemico',
    signature: gapTerms(['cetoacidose diabética insulina', 'reposição de potássio cetoacidose']),
  });
  const dengue = group({
    id: 'g-dengue',
    syndrome: 'febre',
    signature: gapTerms(['dengue sinais de alarme', 'hidratação dengue grupo C']),
  });

  it('junta a lacuna da mesma síndrome e consultas próximas', () => {
    const gap = {
      syndrome: 'disturbio-glicemico',
      terms: gapTerms(['insulina na cetoacidose diabética']),
    };
    expect(findMatchingGroup(gap, [dengue, ketoacidosis])).toBe(ketoacidosis);
  });

  it('não junta síndromes definidas e diferentes, mesmo com os mesmos termos', () => {
    const gap = { syndrome: 'dor-abdominal', terms: ketoacidosis.signature };
    expect(findMatchingGroup(gap, [ketoacidosis])).toBeNull();
  });

  it('a pergunta rápida (sem síndrome) cai no grupo da análise pelo tema', () => {
    const gap = { syndrome: null, terms: gapTerms(['hidratação na dengue com sinais de alarme']) };
    expect(findMatchingGroup(gap, [ketoacidosis, dengue])).toBe(dengue);
  });

  it('lacuna sem consulta só se junta a grupo sem consulta da mesma síndrome', () => {
    const empty = group({ id: 'g-empty-febre', syndrome: 'febre' });
    const emptyOther = group({ id: 'g-empty-null', syndrome: null });
    expect(findMatchingGroup({ syndrome: 'febre', terms: [] }, [dengue, emptyOther, empty])).toBe(
      empty,
    );
    expect(findMatchingGroup({ syndrome: null, terms: [] }, [dengue, empty, emptyOther])).toBe(
      emptyOther,
    );
    expect(findMatchingGroup({ syndrome: 'choque', terms: [] }, [dengue, empty])).toBeNull();
  });

  it('mais de um grupo serve: maior sobreposição, depois Jaccard, depois o mais antigo', () => {
    const broad = group({
      id: 'g-broad',
      syndrome: 'febre',
      signature: ['dengue', 'hidrat', 'plaque', 'sinais', 'alarme', 'grupo'],
    });
    const close = group({ id: 'g-close', syndrome: 'febre', signature: ['dengue', 'hidrat'] });
    const gap = { syndrome: 'febre', terms: ['dengue', 'hidrat'] };
    expect(findMatchingGroup(gap, [broad, close])).toBe(close);

    const older = group({
      id: 'g-z-older',
      syndrome: 'febre',
      signature: ['dengue', 'hidrat'],
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(findMatchingGroup(gap, [close, older])).toBe(older);
    expect(findMatchingGroup(gap, [older, close])).toBe(older);
  });
});

describe('cardCoversGroup', () => {
  const meningitis = {
    syndrome: 'febre',
    signature: gapTerms(['ceftriaxona meningite bacteriana adulto']),
  };

  it('o tema e a pergunta do cartão cobrem o grupo em que cairiam', () => {
    expect(
      cardCoversGroup(
        {
          syndrome: 'febre',
          texts: [
            'Meningite bacteriana',
            'Qual o antibiótico empírico na meningite bacteriana? Ceftriaxona.',
          ],
        },
        meningitis,
      ),
    ).toBe(true);
  });

  it('cartão de outra síndrome ou de outro tema não cobre', () => {
    expect(
      cardCoversGroup(
        { syndrome: 'dor-toracica', texts: ['Meningite bacteriana ceftriaxona'] },
        meningitis,
      ),
    ).toBe(false);
    expect(cardCoversGroup({ syndrome: 'febre', texts: ['Dengue: hidratação'] }, meningitis)).toBe(
      false,
    );
  });

  it('grupo sem consulta nunca é coberto por semelhança', () => {
    expect(
      cardCoversGroup(
        { syndrome: 'febre', texts: ['Dengue'] },
        { syndrome: 'febre', signature: [] },
      ),
    ).toBe(false);
  });
});
