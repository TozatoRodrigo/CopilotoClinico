import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewQuestionCard } from "../review-question-card";
import { answered, multipleChoice, trueFalse } from "./fixtures";

describe("ReviewQuestionCard", () => {
  it("answers in two taps: the option, then how much the physician knew", async () => {
    const onAnswer = vi.fn();
    render(<ReviewQuestionCard question={multipleChoice} onAnswer={onAnswer} />);

    const know = screen.getByRole("button", { name: "Sei" });
    expect(know).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Punção lombar antes da imagem" }));
    expect(screen.getByRole("button", { name: "Punção lombar antes da imagem" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tenho dúvida" }));

    expect(onAnswer).toHaveBeenCalledWith({ chosenOption: 1, confidence: "unsure" });
  });

  it("shows the true/false label and the topic", () => {
    render(<ReviewQuestionCard question={trueFalse} onAnswer={vi.fn()} />);

    expect(screen.getByText("Verdadeiro ou falso")).toBeInTheDocument();
    expect(screen.getByText("Sepse")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: trueFalse.stem })).toBeInTheDocument();
  });

  it("locks the options while the answer is sent", () => {
    render(<ReviewQuestionCard question={multipleChoice} onAnswer={vi.fn()} pending />);

    expect(screen.getByRole("button", { name: "Nenhum exame" })).toBeDisabled();
    expect(screen.getByText("Enviando…")).toBeInTheDocument();
  });

  it("after a wrong answer, shows the right one, the explanation and the cited source", () => {
    render(
      <ReviewQuestionCard
        question={answered(multipleChoice, 1, "know", 0)}
        onAnswer={vi.fn()}
        next={<button type="button">Próxima pergunta</button>}
      />,
    );

    expect(screen.getByText("Não foi dessa vez")).toBeInTheDocument();
    expect(screen.getByText("Resposta: TC de crânio sem contraste")).toBeInTheDocument();
    expect(screen.getByText("Você marcou: Sei")).toBeInTheDocument();
    expect(screen.getByText(/a fonte orienta assim/)).toBeInTheDocument();
    expect(screen.getByText("Diretriz de cefaleia na emergência · 2024")).toBeInTheDocument();
    expect(screen.getByText(/TC sem contraste é o exame inicial/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir a fonte/ })).toHaveAttribute(
      "href",
      "https://example.org/cefaleia.pdf",
    );
    expect(screen.getByRole("link", { name: "Ver o caso: Cefaleia súbita" })).toHaveAttribute(
      "href",
      "/encounters/10000000-0000-4000-8000-000000000001",
    );
    expect(screen.queryByRole("button", { name: "Sei" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima pergunta" })).toBeInTheDocument();
  });

  it("confirms a right answer", () => {
    render(
      <ReviewQuestionCard question={answered(trueFalse, 0, "guessed", 0)} onAnswer={vi.fn()} />,
    );

    expect(screen.getByText("Você acertou")).toBeInTheDocument();
    expect(screen.queryByText(/^Resposta:/)).not.toBeInTheDocument();
  });
});
