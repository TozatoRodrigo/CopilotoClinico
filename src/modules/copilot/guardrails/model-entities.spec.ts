import { describe, expect, it } from 'vitest';
import { maskModelEntities, type ModelEntity, type ModelEntityLabel } from './model-entities';

/** Entidade sobre a primeira ocorrência de `piece` (ou da n-ésima, com `from`). */
function at(text: string, piece: string, label: ModelEntityLabel = 'FIRSTNAME', from = 0) {
  const start = text.indexOf(piece, from);
  if (start < 0) throw new Error(`"${piece}" não está no texto`);
  return { label, start, end: start + piece.length, score: 0.9 } satisfies ModelEntity;
}

describe('maskModelEntities (CC-203)', () => {
  it('troca cada trecho pelo rótulo do tipo', () => {
    const text =
      'Paciente Maria Silva, mora na Rua das Flores, 123, fone 98877-6655, email m@x.com.';
    const { redacted, maskedTypes } = maskModelEntities(text, [
      at(text, 'Maria Silva'),
      at(text, 'Rua das Flores', 'STREET'),
      at(text, '123', 'BUILDINGNUMBER'),
      at(text, '98877-6655', 'PHONE'),
      at(text, 'm@x.com', 'EMAIL'),
    ]);

    expect(redacted).toBe(
      'Paciente [NOME], mora na [ENDERECO], fone [REDACTED_PHONE], email [REDACTED_EMAIL].',
    );
    expect(maskedTypes).toEqual(['name', 'address', 'phone', 'email']);
  });

  it('documento, nascimento e CEP têm rótulo próprio', () => {
    const text = 'SSN 123 nasc 01/02/1950 cep 01001-000 cartão 4111';
    const { redacted } = maskModelEntities(text, [
      at(text, '123', 'SSN'),
      at(text, '01/02/1950', 'DATEOFBIRTH'),
      at(text, '01001-000', 'ZIPCODE'),
      at(text, '4111', 'CREDITCARD'),
    ]);

    expect(redacted).toBe(
      'SSN [REDACTED_DOC] nasc [REDACTED_DATE] cep [REDACTED_CEP] cartão [REDACTED_DOC]',
    );
  });

  it('não toca no que a regex já rotulou', () => {
    const text = 'Seu [NOME] Silva, tel [REDACTED_PHONE].';
    const { redacted } = maskModelEntities(text, [
      at(text, 'NOME'),
      at(text, 'REDACTED_PHONE', 'PHONE'),
      at(text, 'Silva', 'LASTNAME'),
    ]);

    expect(redacted).toBe('Seu [NOME] [NOME], tel [REDACTED_PHONE].');
  });

  it('epônimo protegido sai do trecho do modelo (CC-202)', () => {
    const text = 'Ao exame Kernig e Brudzinski negativos, Glasgow 14. Filha Maria Glasgow.';
    const { redacted } = maskModelEntities(text, [
      at(text, 'Kernig e Brudzinski', 'LASTNAME'),
      at(text, 'Glasgow', 'LASTNAME'),
      at(text, 'Maria Glasgow'),
    ]);

    expect(redacted).toBe(
      'Ao exame Kernig e Brudzinski negativos, Glasgow 14. Filha [NOME] Glasgow.',
    );
  });

  it('leva o sobrenome que o modelo deixou depois do nome', () => {
    const text = 'O marido conta que Paulo Nogueira começou com dor. Sinal de Murphy.';
    const { redacted } = maskModelEntities(text, [at(text, 'Paulo')]);

    expect(redacted).toBe('O marido conta que [NOME] começou com dor. Sinal de Murphy.');
  });

  it('o sobrenome para no epônimo e na quebra de linha', () => {
    const text = 'Filha Ana Glasgow 15\nPaulo\nRefere dor';
    const { redacted } = maskModelEntities(text, [at(text, 'Ana'), at(text, 'Paulo')]);

    expect(redacted).toBe('Filha [NOME] Glasgow 15\n[NOME]\nRefere dor');
  });

  it('leva o prenome que o modelo deixou antes, no meio da frase', () => {
    const text =
      'Masculino, 71 anos (João Pedro da Silva), febre. A vizinha conta que Luiz Fernando Rodrigues caiu.';
    const { redacted } = maskModelEntities(text, [
      at(text, 'Pedro', 'MIDDLENAME'),
      at(text, 'Silva', 'LASTNAME'),
      at(text, 'Fernando', 'MIDDLENAME'),
      at(text, 'Rodrigues', 'LASTNAME'),
    ]);

    expect(redacted).toBe('Masculino, 71 anos ([NOME]), febre. A vizinha conta que [NOME] caiu.');
  });

  it('no começo de frase ou de linha, a primeira palavra maiúscula fica', () => {
    const text = 'Paciente Maria Silva, 54 anos.\nRefere Joana Prado com tosse. Masculino Pereira.';
    const { redacted } = maskModelEntities(text, [
      at(text, 'Silva', 'LASTNAME'),
      at(text, 'Prado', 'LASTNAME'),
      at(text, 'Pereira', 'LASTNAME'),
    ]);

    expect(redacted).toBe('Paciente [NOME], 54 anos.\nRefere [NOME] com tosse. Masculino [NOME].');
  });

  it('junta vizinhos do mesmo tipo e trechos que se sobrepõem', () => {
    const text = 'Filha Ana Paula Gomes, Rua X, 12, Centro.';
    const { redacted, maskedTypes } = maskModelEntities(text, [
      at(text, 'Ana'),
      at(text, 'Ana Paula', 'MIDDLENAME'),
      at(text, 'Gomes', 'LASTNAME'),
      at(text, 'Rua X', 'STREET'),
      at(text, '12', 'BUILDINGNUMBER'),
    ]);

    expect(redacted).toBe('Filha [NOME], [ENDERECO], Centro.');
    expect(maskedTypes).toEqual(['name', 'address']);
  });

  it('ignora trecho fora do texto ou vazio: offset errado não corta o relato', () => {
    const text = 'Paciente com febre.';
    const broken: ModelEntity[] = [
      { label: 'FIRSTNAME', start: 5, end: 500, score: 0.9 },
      { label: 'FIRSTNAME', start: -1, end: 3, score: 0.9 },
      { label: 'FIRSTNAME', start: 4, end: 4, score: 0.9 },
      { label: 'FIRSTNAME', start: 1.5, end: 3, score: 0.9 },
    ];

    expect(maskModelEntities(text, broken)).toEqual({ redacted: text, maskedTypes: [] });
  });

  it('offsets em UTF-16: emoji antes do nome não desloca a máscara', () => {
    const text = 'Febre 😷 e tosse, filha Ana Lima acompanha.';
    const { redacted } = maskModelEntities(text, [at(text, 'Ana Lima')]);

    expect(redacted).toBe('Febre 😷 e tosse, filha [NOME] acompanha.');
  });
});
