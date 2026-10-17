import { describe, expect, it } from 'vitest';
import { storedCardContent } from '../../../../tests/fixtures/knowledge-cards';
import { cardEmbeddingText, embeddingTextSha256 } from './card-embedding-text';

describe('cardEmbeddingText (CC-406)', () => {
  const { content } = storedCardContent();

  it('embute tema, pergunta, população, resposta e afirmações, sem as fontes', () => {
    const text = cardEmbeddingText('Meningite bacteriana', content);

    expect(text.split('\n')).toEqual([
      'Tema: Meningite bacteriana',
      'Pergunta: Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?',
      'População: Adulto no pronto-socorro com suspeita de meningite bacteriana',
      'Resposta: Ceftriaxona 2 g IV a cada 12 horas, iniciada logo após a coleta do líquor.',
      '- Iniciar a ceftriaxona sem aguardar o resultado do líquor.',
      '- A doença meningocócica é de notificação compulsória imediata.',
    ]);
    expect(text).not.toContain('PCDT');
    expect(text).not.toContain(content.answerCitations[0]!.quote);
  });

  it('omite a população ausente e junta espaços e quebras de linha', () => {
    const text = cardEmbeddingText('  Tema \n com quebra ', {
      ...content,
      population: null,
      claims: [],
    });

    expect(text).toBe(
      'Tema: Tema com quebra\n' +
        'Pergunta: Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?\n' +
        'Resposta: Ceftriaxona 2 g IV a cada 12 horas, iniciada logo após a coleta do líquor.',
    );
  });

  it('o hash muda quando o texto muda e é estável para o mesmo texto', () => {
    const text = cardEmbeddingText('Meningite bacteriana', content);

    expect(embeddingTextSha256(text)).toMatch(/^[0-9a-f]{64}$/);
    expect(embeddingTextSha256(text)).toBe(embeddingTextSha256(text));
    expect(embeddingTextSha256(`${text}.`)).not.toBe(embeddingTextSha256(text));
  });
});
