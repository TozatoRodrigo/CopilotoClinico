import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClarifyingQuestions } from "../clarifying-questions";
import type { ClarifyingQuestion } from "@/lib/types";

const blockerQuestion: ClarifyingQuestion = {
  id: "q-immunosuppression",
  question: "O paciente é imunossuprimido?",
  why: "Imunossupressão muda a indicação de oseltamivir — Diretriz X.",
  criticality: "blocker",
  expectedAnswerType: "boolean",
};

const choiceQuestion: ClarifyingQuestion = {
  id: "q-symptom-duration",
  question: "Qual a duração dos sintomas?",
  why: "Duração muda a conduta terapêutica.",
  criticality: "important",
  expectedAnswerType: "choice",
  choices: ["< 24h", "24-48h", "> 48h"],
};

const numberQuestion: ClarifyingQuestion = {
  id: "q-temperature",
  question: "Qual a temperatura corporal (°C)?",
  why: "Febre alta muda a prioridade do atendimento.",
  criticality: "optional",
  expectedAnswerType: "number",
};

const textQuestion: ClarifyingQuestion = {
  id: "q-allergy",
  question: "Quais alergias medicamentosas o paciente possui?",
  why: "Alergias mudam a escolha do medicamento.",
  criticality: "important",
  expectedAnswerType: "text",
};

describe("ClarifyingQuestions", () => {
  it("renders nothing when there are no questions", () => {
    const { container } = render(
      <ClarifyingQuestions questions={[]} answers={{}} onAnswerChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders boolean questions as Sim / Não / Não sei chips and reports taps", async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn();

    render(
      <ClarifyingQuestions
        questions={[blockerQuestion]}
        answers={{}}
        onAnswerChange={onAnswerChange}
      />,
    );

    expect(screen.getByText("O paciente é imunossuprimido?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim" }));

    expect(onAnswerChange).toHaveBeenCalledWith("q-immunosuppression", true);
  });

  it("highlights blocker questions with a 'Muda a conduta' badge and exposes the why", () => {
    render(
      <ClarifyingQuestions
        questions={[blockerQuestion]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Muda a conduta")).toBeInTheDocument();
    expect(
      screen.getByText("Imunossupressão muda a indicação de oseltamivir — Diretriz X."),
    ).toBeInTheDocument();
  });

  it("does not show the blocker badge for non-blocker questions", () => {
    render(
      <ClarifyingQuestions
        questions={[choiceQuestion]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Muda a conduta")).not.toBeInTheDocument();
  });

  it("renders choice questions as chips for each option", async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn();

    render(
      <ClarifyingQuestions
        questions={[choiceQuestion]}
        answers={{}}
        onAnswerChange={onAnswerChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "> 48h" }));

    expect(onAnswerChange).toHaveBeenCalledWith("q-symptom-duration", "> 48h");
  });

  it("renders a numeric input with a numeric keyboard for number questions", async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn();

    render(
      <ClarifyingQuestions
        questions={[numberQuestion]}
        answers={{}}
        onAnswerChange={onAnswerChange}
      />,
    );

    const input = screen.getByLabelText("Qual a temperatura corporal (°C)?");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "numeric");

    await user.type(input, "9");

    expect(onAnswerChange).toHaveBeenCalledWith("q-temperature", 9);
  });

  it("renders a short text input for text questions", async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn();

    render(
      <ClarifyingQuestions
        questions={[textQuestion]}
        answers={{}}
        onAnswerChange={onAnswerChange}
      />,
    );

    const input = screen.getByLabelText("Quais alergias medicamentosas o paciente possui?");
    expect(input).toHaveAttribute("type", "text");

    await user.type(input, "D");

    expect(onAnswerChange).toHaveBeenCalledWith("q-allergy", "D");
  });

  it("orders questions by criticality (blocker first, optional last)", () => {
    const { container } = render(
      <ClarifyingQuestions
        questions={[numberQuestion, blockerQuestion, choiceQuestion]}
        answers={{}}
        onAnswerChange={vi.fn()}
      />,
    );

    const titles = Array.from(container.querySelectorAll('[data-slot="card-title"]')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual([
      "O paciente é imunossuprimido?",
      "Qual a duração dos sintomas?",
      "Qual a temperatura corporal (°C)?",
    ]);
  });

  it("marks the selected answer chip as pressed", () => {
    render(
      <ClarifyingQuestions
        questions={[blockerQuestion]}
        answers={{ "q-immunosuppression": true }}
        onAnswerChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Sim" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Não" })).toHaveAttribute("aria-pressed", "false");
  });
});
