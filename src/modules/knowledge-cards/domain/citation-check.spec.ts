import { describe, expect, it } from 'vitest';
import { validCardInput, validSourceTexts } from '../../../../tests/fixtures/knowledge-cards';
import type { KnowledgeCardContentInput } from '../../../shared/contracts/knowledge-cards';
import { checkCardCitations, normalizeForCitation } from './citation-check';

function check(content: KnowledgeCardContentInput) {
  return checkCardCitations(content, validSourceTexts());
}

function withConductClaim(
  change: (claim: KnowledgeCardContentInput['claims'][number]) => void,
): KnowledgeCardContentInput {
  const content = validCardInput();
  const claim = content.claims[0];
  if (!claim) throw new Error('fixture sem afirmação');
  change(claim);
  return content;
}

describe('normalizeForCitation', () => {
  it('ignora acento, caixa, espaço e tipografia do PDF', () => {
    expect(normalizeForCitation('  Punção   LOMBAR\n– “adiada”  ﬁm ')).toBe(
      'puncao lombar - "adiada" fim',
    );
  });

  it('não troca vírgula decimal nem unidade', () => {
    expect(normalizeForCitation('0,15 mg/kg')).toBe('0,15 mg/kg');
  });
});

describe('checkCardCitations', () => {
  it('aceita o cartão em que toda afirmação e toda dose têm trecho literal', () => {
    expect(check(validCardInput())).toEqual([]);
  });

  it('aceita o trecho com acento, caixa e espaços diferentes da fonte', () => {
    const content = validCardInput();
    content.answerCitations = [
      { sourceKey: 'S1', quote: 'CEFTRIAXONA 2 g por via   intravenosa a cada 12 horas' },
    ];
    content.claims[1]!.citations = [
      { sourceKey: 'S2', quote: 'a doenca meningococica e de notificacao compulsoria imediata' },
    ];

    expect(check(content)).toEqual([]);
  });

  it('rejeita o trecho que não está no texto da fonte (paráfrase do modelo)', () => {
    const content = validCardInput();
    content.answerCitations = [
      { sourceKey: 'S1', quote: 'Ceftriaxona 2 g intravenosa de 12 em 12 horas' },
    ];

    expect(check(content)).toContainEqual({
      path: 'answerCitations[0].quote',
      message: 'trecho citado não encontrado no texto da fonte S1',
    });
  });

  it('rejeita o trecho citado na fonte errada', () => {
    const content = validCardInput();
    content.claims[1]!.citations = [
      { sourceKey: 'S1', quote: 'A doença meningocócica é de notificação compulsória imediata' },
    ];

    expect(check(content)).toEqual([
      {
        path: 'claims[1].citations[0].quote',
        message: 'trecho citado não encontrado no texto da fonte S1',
      },
    ]);
  });

  it('rejeita a fonte que não está entre as fontes do cartão', () => {
    const content = validCardInput();
    content.answerCitations = [{ sourceKey: 'S9', quote: 'Ceftriaxona 2 g por via intravenosa' }];

    expect(check(content)).toContainEqual({
      path: 'answerCitations[0].sourceKey',
      message: 'a fonte S9 não está entre as fontes',
    });
  });

  it('rejeita o trecho curto demais para provar a origem', () => {
    const content = validCardInput();
    content.answerCitations = [{ sourceKey: 'S1', quote: 'Ceftriaxona 2 g' }];

    expect(check(content)).toContainEqual({
      path: 'answerCitations[0].quote',
      message: 'trecho citado curto demais (mínimo 20 letras)',
    });
  });

  describe('dose sem fonte (CC-403, critério 2)', () => {
    it('rejeita a dose da resposta que não está no trecho citado por ela', () => {
      const content = validCardInput();
      content.answer = 'Ceftriaxona 1 g IV a cada 12 horas, logo após a coleta do líquor.';

      expect(check(content)).toEqual([
        { path: 'answer', message: 'dose sem fonte: "1 g" não está no trecho citado' },
      ]);
    });

    it('rejeita a dose escrita na afirmação sem trecho que a traga', () => {
      const content = withConductClaim((claim) => {
        claim.text = 'Associar dexametasona 10 mg IV antes do antibiótico.';
      });

      expect(check(content)).toEqual([
        { path: 'claims[0].text', message: 'dose sem fonte: "10 mg" não está no trecho citado' },
      ]);
    });

    it('aceita a dose da afirmação que está no trecho da dose estruturada', () => {
      const content = withConductClaim((claim) => {
        claim.text = 'Ceftriaxona 2g IV, sem aguardar o líquor.';
      });

      expect(check(content)).toEqual([]);
    });

    it('rejeita cada campo da dose estruturada que não está no trecho da dose', () => {
      const content = withConductClaim((claim) => {
        claim.dose = {
          ...claim.dose!,
          amount: '1 g',
          frequency: 'a cada 8 horas',
          maxDose: '6 g/dia',
        };
      });

      expect(check(content).map((issue) => issue.path)).toEqual([
        'claims[0].dose.amount',
        'claims[0].dose.frequency',
        'claims[0].dose.maxDose',
      ]);
    });

    it('rejeita dose sem número e droga que não aparece na fonte', () => {
      const content = withConductClaim((claim) => {
        claim.dose = {
          ...claim.dose!,
          drug: 'Meropeném',
          amount: 'por via',
          route: null,
          frequency: null,
          maxDose: null,
        };
      });

      expect(check(content)).toEqual([
        { path: 'claims[0].dose.amount', message: 'dose sem quantidade numérica' },
        {
          path: 'claims[0].dose.drug',
          message: '"Meropeném" não aparece no texto da fonte S1',
        },
      ]);
    });

    it('confere o trecho da própria dose contra a fonte', () => {
      const content = withConductClaim((claim) => {
        claim.dose = {
          ...claim.dose!,
          citation: { sourceKey: 'S1', quote: 'Ceftriaxona 2 g IV a cada 12 horas, até 4 g/dia' },
        };
      });

      expect(check(content)).toContainEqual({
        path: 'claims[0].dose.citation.quote',
        message: 'trecho citado não encontrado no texto da fonte S1',
      });
    });

    it('rejeita dose na população, que não tem citação', () => {
      const content = validCardInput();
      content.population = 'Adulto que já recebeu 1 g de ceftriaxona';

      expect(check(content)).toEqual([
        { path: 'population', message: 'a população não pode trazer dose' },
      ]);
    });
  });
});
