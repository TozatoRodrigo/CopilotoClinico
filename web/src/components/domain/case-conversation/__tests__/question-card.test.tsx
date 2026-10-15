import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionCard } from "../question-card";
import type { ConversationQuestion } from "@/lib/case-conversation";

const yesNo: ConversationQuestion = {
  id: "intake-1",
  question: "A dor chegou ao máximo em menos de 1 minuto?",
  why: "Início súbito pede TC de crânio já.",
  separates: ["Hemorragia subaracnóidea", "Enxaqueca"],
  answerType: "choice",
  choices: ["Sim", "Não", "Não sei"],
  unit: null,
  vitalSigns: [],
};

const vitals: ConversationQuestion = {
  ...yesNo,
  id: "intake-2",
  question: "Quais sinais vitais você já tem?",
  answerType: "vitals",
  choices: [],
  vitalSigns: ["bloodPressure", "temperature"],
};

describe("QuestionCard", () => {
  it("shows the question, what it separates and why it is asked", () => {
    render(<QuestionCard question={yesNo} onAnswer={vi.fn()} />);

    expect(screen.getByText(yesNo.question)).toBeInTheDocument();
    expect(screen.getByText(/Hemorragia subaracnóidea × Enxaqueca/)).toBeInTheDocument();
    expect(screen.getByText("Muda a conduta")).toBeInTheDocument();
  });

  it("answers with one tap", async () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={yesNo} onAnswer={onAnswer} />);

    await userEvent.click(screen.getByRole("button", { name: "Não" }));

    expect(onAnswer).toHaveBeenCalledWith({ kind: "choice", value: "Não" });
  });

  it("answers with the number keys", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={yesNo} onAnswer={onAnswer} />);

    fireEvent.keyDown(window, { key: "3" });

    expect(onAnswer).toHaveBeenCalledWith({ kind: "choice", value: "Não sei" });
  });

  it("ignores the number keys while a dialog is open over the conversation", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={yesNo} onAnswer={onAnswer} />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    fireEvent.keyDown(window, { key: "1" });

    expect(onAnswer).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("ignores a held-down key", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={yesNo} onAnswer={onAnswer} />);

    fireEvent.keyDown(window, { key: "1", repeat: true });

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("locks the options while the answer is sent", async () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={yesNo} onAnswer={onAnswer} pendingLabel="Sim" />);

    expect(screen.getByRole("button", { name: "Sim" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Não" }));
    fireEvent.keyDown(window, { key: "2" });

    expect(onAnswer).not.toHaveBeenCalled();
  });

  describe("vital signs", () => {
    it("asks only the missing vital signs and sends them together", async () => {
      const onAnswer = vi.fn();
      render(<QuestionCard question={vitals} onAnswer={onAnswer} />);

      expect(screen.queryByText(/FC/)).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText(/PA/), "150/90");
      await userEvent.type(screen.getByLabelText(/Tax/), "37,8");
      await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

      expect(onAnswer).toHaveBeenCalledWith({
        kind: "vitals",
        value: expect.objectContaining({ systolicBp: 150, diastolicBp: 90, temperature: 37.8 }),
        label: "PA 150/90 mmHg · Tax 37,8 °C",
      });
    });

    it("explains how to write a value that does not parse", async () => {
      const onAnswer = vi.fn();
      render(<QuestionCard question={vitals} onAnswer={onAnswer} />);

      await userEvent.type(screen.getByLabelText(/PA/), "150");
      await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

      expect(onAnswer).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("120/80");
    });

    it("accepts that the vital signs are not at hand", async () => {
      const onAnswer = vi.fn();
      render(<QuestionCard question={vitals} onAnswer={onAnswer} />);

      await userEvent.click(screen.getByRole("button", { name: "Não tenho agora" }));

      expect(onAnswer).toHaveBeenCalledWith({ kind: "unknown", value: "Não tenho agora" });
    });
  });

  it("sends a number with its unit", async () => {
    const onAnswer = vi.fn();
    render(
      <QuestionCard
        question={{ ...yesNo, answerType: "number", choices: [], unit: "mg/dL" }}
        onAnswer={onAnswer}
      />,
    );

    await userEvent.type(screen.getByRole("textbox"), "54");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onAnswer).toHaveBeenCalledWith({ kind: "number", value: 54, label: "54 mg/dL" });
  });
});
