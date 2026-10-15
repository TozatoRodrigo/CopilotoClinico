/**
 * Respostas falsas do Jev (TypeSafe) no formato da documentação pública
 * (docs.typesafe.ai/api). Nenhum teste chama a API: o `fetch` é falso.
 */

export function jevResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jevChoiceBody(choice: string, confidence: number, questionId: string) {
  return {
    model: 'jev-1.13.0',
    answers: {
      [questionId]: {
        type: 'choice',
        choice,
        probabilities: { [choice]: confidence },
        confidence,
      },
    },
    usage: { input_tokens: 87, output_tokens: 0 },
  };
}

export function jevNoulBody(probability: number, questionId: string, inputTokens = 120) {
  return {
    model: 'jev-1.13.0',
    answers: { [questionId]: { type: 'noul', noul: probability } },
    usage: { input_tokens: inputTokens, output_tokens: 0 },
  };
}
