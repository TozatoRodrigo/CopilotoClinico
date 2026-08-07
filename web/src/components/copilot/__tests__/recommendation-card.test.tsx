import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
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

// RecommendationCard usa <Tooltip> (dica de confiança) internamente, que
// exige um <TooltipProvider> na árvore — presente no layout raiz real do
// app (web/src/app/layout.tsx), mas não neste render isolado de teste.
// Sem isto, qualquer recomendação não-preliminar (que renderiza o
// tooltip) derruba o teste inteiro — mesmo padrão já usado em
// copilot-conversation.test.tsx.
function renderCard(rec: CopilotRecommendation) {
  return render(
    <TooltipProvider>
      <RecommendationCard rec={rec} />
    </TooltipProvider>,
  );
}

describe("RecommendationCard", () => {
  // O componente é uma <div> simples com Tailwind (não o primitivo Card —
  // não tem data-slot="card"), e a categoria/estado dita a cor de fundo
  // diretamente, não uma classe "opacity-60" — o "esmaecido" visual de uma
  // recomendação preliminar hoje é o fundo claro (bg-white/40) contra o
  // fundo colorido (verde/âmbar) das recomendações definitivas/de
  // estabilização. container.firstChild é a raiz do componente (o
  // TooltipProvider ao redor não introduz nenhum nó no DOM).
  it("renders a definitive recommendation with the category background, without the preliminary badge", () => {
    const { container } = renderCard(baseRec);

    expect(screen.getByText(baseRec.action)).toBeInTheDocument();
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-clinical-green-bg");
    expect(container.firstChild).not.toHaveClass("bg-white/40");
  });

  it("dims preliminary recommendations (light background) and shows the preliminary badge", () => {
    const { container } = renderCard({ ...baseRec, preliminary: true });

    expect(screen.getByText("Preliminar — responda as perguntas acima")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-white/40");
  });

  // S23-UX-01 — o rótulo "Confiança: X%" foi deliberadamente substituído
  // por um percentual isolado ("82%") ao lado de um ícone de informação
  // que abre um tooltip com a metodologia — "87% sem contexto pode
  // parecer garantia" (ver comentário no próprio componente). O teste
  // antigo checava o texto pré-redesign; aqui checamos o texto real e o
  // rótulo acessível do botão que abre o tooltip.
  it("renders the confidence percentage (with an accessible tooltip trigger) and source link", () => {
    renderCard(baseRec);

    const trigger = screen.getByRole("button", { name: "Como calculamos a confiança" });
    expect(trigger).toHaveTextContent("82%");
    expect(screen.getByText("Conduta")).toBeInTheDocument();
    expect(screen.getByText(baseRec.sourceText!)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Ver trecho completo" });
    expect(link).toHaveAttribute("href", baseRec.sourceUrl);
  });

  it('highlights stabilization recommendations with the "Agora" badge', () => {
    renderCard({ ...baseRec, category: "stabilization" });

    expect(screen.getByText("Agora")).toBeInTheDocument();
  });
});
