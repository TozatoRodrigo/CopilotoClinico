import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoverageBanner } from "../coverage-banner";

/**
 * KB-005/KB-006 — o banner existe para que "a base não cobre este cenário"
 * chegue ao médico como informação sobre a BASE, não como hesitação do
 * modelo. Nos dois casos reportados em campo (dengue conduzido como sepse,
 * cefaleia em salvas apontada como hemorragia) o médico não tinha como saber
 * que a evidência citada era do cenário vizinho.
 */
describe("CoverageBanner", () => {
  it("avisa que nenhuma diretriz cobre o cenário quando a cobertura é none", () => {
    render(<CoverageBanner coverage="none" />);

    expect(screen.getByText(/Nenhuma diretriz da base cobre este cenário/i)).toBeInTheDocument();
  });

  it("avisa sobre encaixe fraco quando a cobertura é parcial", () => {
    render(<CoverageBanner coverage="partial" />);

    expect(screen.getByText(/Cobertura parcial da base/i)).toBeInTheDocument();
  });

  it("não renderiza nada quando a cobertura é forte", () => {
    const { container } = render(<CoverageBanner coverage="full" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada quando a cobertura é desconhecida — nunca afirmar o que não foi medido", () => {
    // Interações gravadas antes desta mudança não têm `retrievalCoverage`.
    // Silêncio é o comportamento correto: inventar "full" diria ao médico que
    // a base cobria o caso sem que isso tenha sido verificado.
    const { container } = render(<CoverageBanner coverage={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("oferece a consulta de diretrizes sem sair do caso", async () => {
    const onSearchGuidelines = vi.fn();
    render(<CoverageBanner coverage="none" onSearchGuidelines={onSearchGuidelines} />);

    // Botão, não link: a consulta abre no painel lateral, dentro do caso.
    expect(screen.queryByRole("link", { name: /Buscar nas diretrizes/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Buscar nas diretrizes/i }));
    expect(onSearchGuidelines).toHaveBeenCalledTimes(1);
  });
});
