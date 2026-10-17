import { describe, expect, it } from 'vitest';
import { reviewedCard } from '../../../tests/fixtures/reviewed-cards';
import { ANAPHYLAXIS_CARD_ID, anaphylaxisCard } from '../../../tests/fixtures/quick-question';
import { toQuickQuestionCardAnswer } from './card-answer';

describe('toQuickQuestionCardAnswer (CC-501)', () => {
  it('devolve o texto assinado do cartão, sem reescrita, com quem revisou', () => {
    const card = reviewedCard();
    const answer = toQuickQuestionCardAnswer(card, { status: 'none' });

    expect(answer).toMatchObject({
      cardId: card.cardId,
      version: 2,
      topic: 'Meningite bacteriana',
      question: card.content.question,
      population: card.content.population,
      answer: card.content.answer,
      reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
      reviewedAt: card.reviewedAt,
      validUntil: card.validUntil,
    });
    // Sem id interno do revisor na tela do plantão.
    expect(answer.reviewer).not.toHaveProperty('id');
  });

  it('cada dose estruturada sai como foi assinada, com o trecho que a sustenta', () => {
    const answer = toQuickQuestionCardAnswer(reviewedCard(), { status: 'found', kg: 70 });

    expect(answer.doses).toEqual([
      {
        drug: 'Ceftriaxona',
        amount: '2 g',
        route: 'intravenosa',
        frequency: 'a cada 12 horas',
        maxDose: '4 g/dia',
        claim: 'Iniciar a ceftriaxona sem aguardar o resultado do líquor.',
        citation: {
          sourceKey: 'S1',
          quote: 'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia',
        },
        weightBased: { status: 'not_weight_based' },
      },
    ]);
  });

  it('calcula a dose por peso ao lado da dose do cartão', () => {
    const answer = toQuickQuestionCardAnswer(anaphylaxisCard(), { status: 'found', kg: 20 });

    expect(answer.cardId).toBe(ANAPHYLAXIS_CARD_ID);
    expect(answer.doses[0]?.amount).toBe('0,01 mg/kg');
    expect(answer.doses[0]?.weightBased).toEqual({
      status: 'computed',
      weightKg: 20,
      perKg: '0,01 mg/kg',
      total: '0,2 mg',
      cappedAtMaxDose: false,
    });
  });

  it('lista só as fontes que a resposta e as doses citam, com os trechos sem repetir', () => {
    const answer = toQuickQuestionCardAnswer(anaphylaxisCard(), { status: 'none' });

    expect(answer.sources).toEqual([
      {
        key: 'S1',
        title: 'Protocolo de anafilaxia',
        section: '3. Tratamento',
        sourceVersion: '2025-03',
        url: 'https://example.org/anafilaxia.pdf',
        quotes: [
          'Adrenalina 0,01 mg/kg por via intramuscular, dose máxima de 0,5 mg, repetir a cada 5 a 15 minutos',
        ],
      },
    ]);
  });
});
