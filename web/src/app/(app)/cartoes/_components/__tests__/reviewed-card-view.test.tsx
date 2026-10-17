import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PublishedKnowledgeCard } from '@/lib/types';
import { ReviewedCardView, formatDose } from '../reviewed-card-view';

const dose = {
  drug: 'Ceftriaxona',
  amount: '2 g',
  route: 'intravenosa',
  frequency: 'a cada 12 horas',
  maxDose: '4 g/dia',
  citation: { sourceKey: 'S1', quote: 'Ceftriaxona 2 g por via intravenosa a cada 12 horas' },
};

const card: PublishedKnowledgeCard = {
  id: '77777777-7777-4777-8777-777777777777',
  topic: 'Meningite bacteriana',
  syndrome: 'febre',
  displayStatus: 'published',
  version: 2,
  content: {
    question: 'Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?',
    population: 'Adulto no pronto-socorro com suspeita de meningite bacteriana',
    answer: 'Ceftriaxona 2 g IV a cada 12 horas, iniciada logo após a coleta do líquor.',
    answerCitations: [{ sourceKey: 'S1', quote: 'Ceftriaxona 2 g por via intravenosa' }],
    claims: [
      {
        kind: 'conduct',
        text: 'Iniciar a ceftriaxona sem aguardar o resultado do líquor.',
        dose,
        citations: [{ sourceKey: 'S1', quote: 'iniciar antibioticoterapia empírica' }],
      },
    ],
    sources: [
      {
        key: 'S1',
        chunkId: '11111111-1111-4111-8111-111111111111',
        documentId: null,
        title: 'PCDT · Meningite bacteriana',
        sourceVersion: '2024-05',
        section: '7. TRATAMENTO',
        url: 'https://www.gov.br/conitec/pcdt-meningite.pdf',
        chunkSha256: 'a'.repeat(64),
      },
    ],
  },
  reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
  reviewedAt: '2026-10-12T15:00:00.000Z',
  validUntil: '2027-10-12T15:00:00.000Z',
};

describe('ReviewedCardView — CC-408', () => {
  it('mostra a pergunta, quem revisou, a dose estruturada e as fontes', () => {
    render(<ReviewedCardView card={card} />);

    expect(screen.getByRole('heading', { name: card.content.question })).toBeInTheDocument();
    expect(
      screen.getByText('Revisado por Dr(a). Ana Souza · CRM 123456/SP · em 12/10/2026'),
    ).toBeInTheDocument();
    expect(screen.getByText('Válido até 12/10/2027')).toBeInTheDocument();
    expect(
      screen.getByText('Ceftriaxona 2 g · intravenosa · a cada 12 horas · máx. 4 g/dia'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pcdt-meningite\.pdf/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.queryByText(/aprovação deste cartão venceu/)).not.toBeInTheDocument();
  });

  it('avisa quando a aprovação venceu', () => {
    render(<ReviewedCardView card={{ ...card, displayStatus: 'needs_review' }} />);

    expect(screen.getByText(/aprovação deste cartão venceu/)).toBeInTheDocument();
  });

  it('formata a dose sem campo vazio', () => {
    expect(formatDose({ ...dose, route: null, frequency: null, maxDose: null })).toBe(
      'Ceftriaxona 2 g',
    );
  });
});
