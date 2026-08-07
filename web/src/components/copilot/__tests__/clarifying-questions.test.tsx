import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClarifyingQuestions } from "../clarifying-questions";
import type { ClarifyingQuestion } from "@/lib/types";

function question(overrides: Partial<ClarifyingQuestion> & Pick<ClarifyingQuestion, "id" | "question">): ClarifyingQuestion {
  return {
    why: "Motivo clínico padrão para este teste.",
    criticality: "important",
    expectedAnswerType: "boolean",
    ...overrides,
  };
}

describe("ClarifyingQuestions (UX-01)", () => {
  it("returns null when there are no questions", () => {
    const { container } = render(
      <ClarifyingQuestions questions={[]} answers={{}} onAnswerChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the preceptor-toned heading, never a deficiency-framed one", () => {
    render(
      <ClarifyingQuestions
        questions={[question({ id: "q1", question: "Início súbito?" })]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Para orientar com segurança, preciso de:")).toBeInTheDocument();
    expect(screen.queryByText(/insuficiente/i)).not.toBeInTheDocument();
  });

  it("degrades gracefully to a flat list — no purpose group headers — when no question has a purpose", () => {
    render(
      <ClarifyingQuestions
        questions={[
          question({ id: "q1", question: "Início súbito?", criticality: "blocker" }),
          question({ id: "q2", question: "Há febre?", criticality: "important" }),
        ]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Início súbito?")).toBeInTheDocument();
    expect(screen.getByText("Há febre?")).toBeInTheDocument();
    // Nenhum <h3> de finalidade clínica deveria existir neste modo.
    expect(document.querySelectorAll("h3")).toHaveLength(0);
  });

  it("groups questions under their shared clinical purpose when all questions have one", () => {
    render(
      <ClarifyingQuestions
        questions={[
          question({
            id: "q1",
            question: "Qual a PA atual?",
            criticality: "blocker",
            expectedAnswerType: "number",
            purpose: "Estabilidade hemodinâmica",
          }),
          question({
            id: "q2",
            question: "Qual a FC atual?",
            criticality: "important",
            expectedAnswerType: "number",
            purpose: "Estabilidade hemodinâmica",
          }),
          question({
            id: "q3",
            question: "Início súbito ou progressivo?",
            criticality: "important",
            expectedAnswerType: "choice",
            choices: ["Súbito", "Progressivo"],
            purpose: "Tempo de evolução",
          }),
        ]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );

    const groupHeadings = Array.from(document.querySelectorAll("h3")).map((el) => el.textContent);
    expect(groupHeadings).toEqual(["Estabilidade hemodinâmica", "Tempo de evolução"]);

    // As duas perguntas do mesmo grupo aparecem sob o mesmo cabeçalho.
    expect(screen.getByText("Qual a PA atual?")).toBeInTheDocument();
    expect(screen.getByText("Qual a FC atual?")).toBeInTheDocument();
  });

  it("falls back to an ungrouped list when only SOME questions have a purpose (no mixed rendering)", () => {
    render(
      <ClarifyingQuestions
        questions={[
          question({
            id: "q1",
            question: "Qual a PA atual?",
            criticality: "blocker",
            purpose: "Estabilidade hemodinâmica",
          }),
          question({ id: "q2", question: "Há febre?", criticality: "important" }),
        ]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );
    expect(document.querySelectorAll("h3")).toHaveLength(0);
    expect(screen.getByText("Qual a PA atual?")).toBeInTheDocument();
    expect(screen.getByText("Há febre?")).toBeInTheDocument();
  });

  it("orders groups by their most critical member — a blocker pulls its whole group first", () => {
    render(
      <ClarifyingQuestions
        questions={[
          question({
            id: "q-optional",
            question: "Uso de álcool recente?",
            criticality: "optional",
            purpose: "Histórico geral",
          }),
          question({
            id: "q-blocker",
            question: "Há déficit neurológico focal?",
            criticality: "blocker",
            purpose: "Sinais de alarme neurológico",
          }),
        ]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );

    const groupHeadings = Array.from(document.querySelectorAll("h3")).map((el) => el.textContent);
    expect(groupHeadings).toEqual(["Sinais de alarme neurológico", "Histórico geral"]);
  });

  it("calls onAnswerChange with the correct questionId when answering a grouped question", async () => {
    const onAnswerChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ClarifyingQuestions
        questions={[
          question({
            id: "q1",
            question: "Há febre?",
            criticality: "important",
            purpose: "Triagem infecciosa",
          }),
        ]}
        answers={{}}
        onAnswerChange={onAnswerChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sim" }));
    expect(onAnswerChange).toHaveBeenCalledWith("q1", true);
  });

  it("auto-focuses the first interactive control of the first question, not later ones", () => {
    render(
      <ClarifyingQuestions
        questions={[
          question({ id: "q1", question: "Início súbito?", criticality: "blocker" }),
          question({ id: "q2", question: "Há febre?", criticality: "important" }),
        ]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );

    // Primeiro botão da primeira pergunta ("Sim" do grupo q1) recebe foco.
    const firstQuestionButtons = screen.getAllByRole("button", { name: "Sim" });
    expect(firstQuestionButtons[0]).toHaveFocus();
  });

  it("renders disabled inputs when disabled=true, across all groups", () => {
    render(
      <ClarifyingQuestions
        questions={[
          question({
            id: "q1",
            question: "Qual a PA?",
            expectedAnswerType: "number",
            purpose: "Estabilidade hemodinâmica",
          }),
        ]}
        answers={{}}
        onAnswerChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("Qual a PA?")).toBeDisabled();
  });
});
