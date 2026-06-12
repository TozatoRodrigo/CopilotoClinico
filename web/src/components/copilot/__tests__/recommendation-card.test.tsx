import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecommendationCard } from "../recommendation-card";
import type { CopilotRecommendation } from "@/lib/types";

const baseRec: CopilotRecommendation = {
  action: "Solicitar oseltamivir 75mg 12/12h por 5 dias",
  rationale: "Síndrome gripal com mais de 48h de evolução",
  citationChunkId: "chunk-1",
  confidence: 0.82,
  preliminary: false,
  category: "therapeutic",
  source: "Diretriz Influenza",
  sourceVersion: "2024",
  sourceText: "Pacientes com síndrome gripal...",
  sourceUrl: "https://example.com/diretriz",
};

describe("RecommendationCard", () => {
  it("renders a definitive recommendation at full opacity without the preliminary badge", () => {
    const { container } = render(<RecommendationCard rec={baseRec} />);

    expect(screen.getByText(baseRec.action)).toBeInTheDocument();
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).not.toHaveClass("opacity-60");
  });

  it("dims preliminary recommendations and shows the preliminary badge", () => {
    const { container } = render(
      <RecommendationCard rec={{ ...baseRec, preliminary: true }} />,
    );

    expect(screen.getByText("Preliminar — responda as perguntas acima")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toHaveClass("opacity-60");
  });

  it("renders the confidence percentage and source link", () => {
    render(<RecommendationCard rec={baseRec} />);

    expect(screen.getByText("Confiança: 82%")).toBeInTheDocument();
    expect(screen.getByText("Conduta")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Diretriz Influenza v2024" });
    expect(link).toHaveAttribute("href", baseRec.sourceUrl);
  });

  it('highlights stabilization recommendations with the "Agora" badge', () => {
    render(<RecommendationCard rec={{ ...baseRec, category: "stabilization" }} />);

    expect(screen.getByText("Agora")).toBeInTheDocument();
  });
});
