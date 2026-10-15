import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlockerQuestionCard } from "../blocker-question-card";
import { getMessages } from "@/lib/messages";

// F1 — decisão v2: cada pergunta diz quais hipóteses a resposta separa.
describe("BlockerQuestionCard — F1: hipóteses que a resposta separa", () => {
  it('mostra "Separa: A × B" abaixo da pergunta', () => {
    render(
      <BlockerQuestionCard
        question="Qual o horário do último momento visto bem?"
        why="Define a janela de reperfusão"
        separates={getMessages("pt-BR").copilot.questions.separates([
          "AVC na janela",
          "AVC fora da janela",
        ])}
      >
        <span>resposta</span>
      </BlockerQuestionCard>,
    );

    expect(screen.getByText("Separa: AVC na janela × AVC fora da janela")).toBeInTheDocument();
  });

  it("não mostra nada a mais nas perguntas v1, sem hipóteses", () => {
    render(
      <BlockerQuestionCard question="Há febre?" why="Muda a conduta">
        <span>resposta</span>
      </BlockerQuestionCard>,
    );

    expect(screen.queryByText(/Separa:/)).not.toBeInTheDocument();
  });
});
