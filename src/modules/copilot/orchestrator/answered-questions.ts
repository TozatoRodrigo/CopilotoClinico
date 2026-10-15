const ANSWERED_QUESTIONS_HEADER = '--- Informações adicionais fornecidas pelo médico ---';

/**
 * O caso com o bloco "P: … R: …" das respostas do médico, como a análise o lê.
 * Fora do orquestrador para que o rascunho de caso do gabarito (CC-703)
 * reproduza o mesmo texto que o modelo recebeu na rodada reportada.
 */
export function withAnsweredQuestions(
  caseText: string,
  answers: ReadonlyArray<{ question: string; answer: string }>,
): string {
  if (answers.length === 0) return caseText;
  const qaBlock = answers.map((qa) => `P: ${qa.question}\nR: ${qa.answer}`).join('\n\n');
  return `${caseText}\n\n${ANSWERED_QUESTIONS_HEADER}\n${qaBlock}`;
}
