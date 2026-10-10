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

  // F0-D — Adotar + nota é gravado como `modified` (adotada com ajuste).
  it('shows an "Adotada com ajuste" badge and keeps Adotar pressed for a modified recommendation', () => {
    renderItem({
      decision: { decision: "modified", note: "Dose menor", decidedAt: new Date().toISOString() },
    });

    expect(screen.getByText("Adotada com ajuste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adotar" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(baseRec.action)).not.toHaveClass("line-through");
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

describe("RecommendationItem — origem da fonte (F4 / ADR-010)", () => {
  function renderRec(rec: CopilotRecommendation) {
    render(
      <RecommendationItem
        rec={rec}
        index={0}
        decision={undefined}
        onAdopt={vi.fn()}
        onReject={vi.fn()}
        onNote={vi.fn()}
      />,
    );
  }

  it("marca PCDT como Ministério da Saúde não revisado, com a portaria e o link do PDF", () => {
    renderRec({
      ...baseRec,
      source: "PCDT — Acidentes Ofídicos",
      sourceVersion: "Portaria SECTICS/MS nº 83 - 07/10/2025",
      sourceUrl: "https://www.gov.br/conitec/pcdt_acidentes_ofidicos_final.pdf",
      origin: "official_unreviewed",
    });

    expect(screen.getByText("Ministério da Saúde · não revisado pela equipe")).toBeInTheDocument();
    expect(screen.getByText("Portaria SECTICS/MS nº 83 - 07/10/2025")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver documento oficial" })).toHaveAttribute(
      "href",
      "https://www.gov.br/conitec/pcdt_acidentes_ofidicos_final.pdf",
    );
  });

  it("marca anexo do médico como não curado", () => {
    renderRec({ ...baseRec, origin: "physician_attachment" });

    expect(screen.getByText("Anexo do médico · não curada")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver documento oficial" })).not.toBeInTheDocument();
  });

  it("não afirma origem para diretriz curada nem para análise antiga sem o campo", () => {
    renderRec({ ...baseRec, origin: "public" });
    renderRec(baseRec);

    expect(screen.queryByText(/não revisado|não curada/)).not.toBeInTheDocument();
  });
});

// F0-C — a UI não mostra probabilidade (decisão clínica: "médico trabalha
// muito mal com probabilidades") e diz POR QUE a conduta é preliminar.
describe("RecommendationItem — F0-C: confiança e motivo do preliminar", () => {
  function renderRec(rec: CopilotRecommendation) {
    render(
      <RecommendationItem
        rec={rec}
        index={0}
        decision={undefined}
        onAdopt={vi.fn()}
        onReject={vi.fn()}
        onNote={vi.fn()}
      />,
    );
  }

  function tagOf(text: string): HTMLElement {
    const tag = screen.getByText(text).closest<HTMLElement>('[data-slot="badge"]');
    if (!tag) throw new Error(`"${text}" não está numa tag`);
    return tag;
  }

  it("não mostra a confiança autodeclarada pelo modelo", () => {
    renderRec({ ...baseRec, confidence: 0.87 });

    expect(screen.queryByText(/confiança/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/87\s?%/)).not.toBeInTheDocument();
    expect(document.querySelector("[title*='onfiança']")).toBeNull();
  });

  it("não mostra tag de preliminar em conduta definitiva", () => {
    renderRec(baseRec);

    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
  });

  it("mantém o rótulo de sempre, em laranja, para perguntas pendentes", () => {
    renderRec({ ...baseRec, preliminary: true, preliminaryReason: "pending_questions" });

    expect(tagOf("Preliminar")).toHaveAttribute("data-variant", "warning");
  });

  it("trata análise antiga, sem preliminaryReason, como perguntas pendentes", () => {
    renderRec({ ...baseRec, preliminary: true });

    expect(tagOf("Preliminar")).toHaveAttribute("data-variant", "warning");
  });

  it("diz que a fonte não foi revisada por médico, em cinza: informa, não muda a conduta", () => {
    renderRec({
      ...baseRec,
      preliminary: true,
      preliminaryReason: "unreviewed_source",
      origin: "curated_unsigned",
    });

    expect(tagOf("Preliminar · Fonte não revisada por médico")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("diz que o subtipo está indefinido, em laranja: o dado que discrimina muda a conduta", () => {
    renderRec({ ...baseRec, preliminary: true, preliminaryReason: "subtype_ambiguity" });

    expect(
      tagOf("Preliminar · Subtipo indefinido — depende do dado que discrimina"),
    ).toHaveAttribute("data-variant", "warning");
  });

  it("marca o chunk curado sem assinatura com a mesma tag cinza da base oficial", () => {
    renderRec({
      ...baseRec,
      preliminary: true,
      preliminaryReason: "unreviewed_source",
      origin: "curated_unsigned",
    });

    expect(tagOf("Base curada · sem assinatura médica")).toHaveAttribute("data-variant", "gray");
    expect(screen.queryByRole("link", { name: "Ver documento oficial" })).not.toBeInTheDocument();
  });
});
