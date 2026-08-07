import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecommendationItem } from "../page";
import type { CopilotRecommendation } from "@/lib/types";
import type { RecommendationDecisionState } from "@/hooks/use-recommendation-decisions";

// UX-09 — bug relatado ao vivo por um médico do piloto: na tela de
// resultado (a que de fato roda em produção), só "Adotar" funcionava.
// "Rejeitar" chamava o handler mas a UI não dava feedback nenhum; "Anotar"
// não tinha onClick — não fazia nada. Estes testes cobrem exatamente os
// dois botões quebrados.

const baseRec: CopilotRecommendation = {
  action: "Solicitar ECG de 12 derivações",
  rationale: "Dor torácica aguda com fatores de risco cardiovascular",
  citationChunkId: "chunk-1",
  confidence: 0.82,
  preliminary: false,
  category: "diagnostic",
  source: "Diretriz Dor Torácica",
  sourceVersion: "2024",
  sourceText: "trecho da diretriz",
  sourceUrl: "https://example.com/diretriz",
};

function renderItem(overrides: {
  decision?: RecommendationDecisionState;
  onAdopt?: () => void;
  onReject?: () => void;
  onNote?: (note: string) => void;
} = {}) {
  const onAdopt = overrides.onAdopt ?? vi.fn();
  const onReject = overrides.onReject ?? vi.fn();
  const onNote = overrides.onNote ?? vi.fn();
  render(
    <RecommendationItem
      rec={baseRec}
      index={0}
      decision={overrides.decision}
      onAdopt={onAdopt}
      onReject={onReject}
      onNote={onNote}
      confidenceLabel="82%"
    />,
  );
  return { onAdopt, onReject, onNote };
}

describe("RecommendationItem — UX-09: Rejeitar e Anotar", () => {
  it("calls onReject when the Rejeitar button is clicked", async () => {
    const user = userEvent.setup();
    const { onReject } = renderItem();

    await user.click(screen.getByRole("button", { name: "Rejeitar" }));

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('shows a "Rejeitada" badge and strikes through the action once rejected', () => {
    renderItem({ decision: { decision: "rejected", decidedAt: new Date().toISOString() } });

    expect(screen.getByText("Rejeitada")).toBeInTheDocument();
    expect(screen.getByText(baseRec.action)).toHaveClass("line-through");
  });

  it('shows an "Adotada" badge (no strikethrough) once adopted', () => {
    renderItem({ decision: { decision: "adopted", decidedAt: new Date().toISOString() } });

    expect(screen.getByText("Adotada")).toBeInTheDocument();
    expect(screen.getByText(baseRec.action)).not.toHaveClass("line-through");
  });

  it("reveals a textarea when Anotar is clicked, and calls onNote as the physician types", async () => {
    const user = userEvent.setup();
    const { onNote } = renderItem();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Anotar/ }));

    const textarea = screen.getByRole("textbox", { name: /Anotação para/ });
    expect(textarea).toBeInTheDocument();

    await user.type(textarea, "x");
    expect(onNote).toHaveBeenCalledWith("x");
  });

  it('shows "Editar nota" instead of "Anotar" once a note already exists, and displays the saved note when collapsed', () => {
    renderItem({
      decision: {
        decision: "adopted",
        note: "Confirmar com o paciente antes de prosseguir",
        decidedAt: new Date().toISOString(),
      },
    });

    expect(screen.getByRole("button", { name: /Editar nota/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Confirmar com o paciente antes de prosseguir/),
    ).toBeInTheDocument();
  });

  it("does not throw and renders both action buttons when there is no decision yet (pending state)", () => {
    renderItem();

    expect(screen.getByRole("button", { name: "Adotar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejeitar" })).toBeInTheDocument();
    expect(screen.queryByText("Adotada")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejeitada")).not.toBeInTheDocument();
  });
});
