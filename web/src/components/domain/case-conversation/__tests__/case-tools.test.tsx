import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readCaseLink, type CaseToolAttachment } from "@/lib/case-tool-link";
import type { CaseToolSuggestions } from "@/lib/types";
import { CaseToolAttachments, CaseToolSuggestionsSection } from "../case-tools";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/**
 * CC-332 — "Ferramentas para este caso" no plano e os resultados anexados à
 * espera da próxima reanálise.
 */

const SUGGESTIONS: CaseToolSuggestions = {
  mappingVersion: "1.0.0",
  facts: {
    ageYears: 67,
    sex: "F",
    weightKg: 73,
    systolicBp: 82,
    diastolicBp: 47,
    heartRate: 131,
    respiratoryRate: 33,
    spo2: 89,
    temperature: 38.9,
    glucose: null,
  },
  suggestions: [
    {
      ruleId: "suspeita-tep",
      target: { kind: "tool", toolId: "tep" },
      name: "Tromboembolismo pulmonar",
      reason: "Suspeita de TEP: Wells, PERC e conduta",
    },
    {
      ruleId: "teste-perc",
      target: { kind: "calculator", calculatorId: "perc-rule" },
      name: "PERC Rule",
      reason: "Probabilidade pré-teste baixa",
    },
  ],
};

function renderSection(toolSuggestions: CaseToolSuggestions | undefined) {
  return render(
    <CaseToolSuggestionsSection
      encounterId="enc-332"
      interactionId="interaction-1"
      toolSuggestions={toolSuggestions}
    />,
  );
}

beforeEach(() => {
  push.mockClear();
  vi.stubEnv("NEXT_PUBLIC_FERRAMENTAS", "on");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ferramentas sugeridas no plano", () => {
  it("mostra cada ferramenta com o motivo e quantos campos o caso preenche", () => {
    renderSection(SUGGESTIONS);

    expect(screen.getByRole("region", { name: "Ferramentas para este caso" })).toBeInTheDocument();
    expect(screen.getByText("Suspeita de TEP: Wells, PERC e conduta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir Tromboembolismo pulmonar" })).toBeInTheDocument();
    // TEP: o Wells (FC) e o PERC (idade, FC, SpO₂) de dentro do roteiro.
    expect(screen.getByText("4 campos já preenchidos com o caso")).toBeInTheDocument();
    expect(screen.getByText("3 campos já preenchidos com o caso")).toBeInTheDocument();
    expect(screen.getByText(/regra fixa \(mapeamento v1\.0\.0\), não pela IA/)).toBeInTheDocument();
  });

  it("abre a ferramenta com o dado do caso na aba, nunca no endereço", async () => {
    renderSection(SUGGESTIONS);

    await userEvent.click(screen.getByRole("button", { name: "Abrir PERC Rule" }));

    const href = push.mock.calls[0]?.[0] as string;
    expect(href).toMatch(/^\/ferramentas\/calculadoras\/perc-rule\?caso=[a-z]{16}$/);
    expect(href).not.toMatch(/\d/);
    const token = new URL(href, "http://copiloto.local").searchParams.get("caso")!;
    expect(readCaseLink(token)).toMatchObject({
      encounterId: "enc-332",
      interactionId: "interaction-1",
      facts: SUGGESTIONS.facts,
    });
  });

  it("com as Ferramentas desligadas no web, nada aparece", () => {
    vi.stubEnv("NEXT_PUBLIC_FERRAMENTAS", "");
    const { container } = renderSection(SUGGESTIONS);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem sugestão da API (COPILOT_TOOL_SUGGESTIONS desligada), nada aparece", () => {
    expect(renderSection(undefined).container).toBeEmptyDOMElement();
  });

  it("sem ferramenta para o caso, nada aparece", () => {
    expect(renderSection({ ...SUGGESTIONS, suggestions: [] }).container).toBeEmptyDOMElement();
  });
});

describe("resultados anexados ao caso", () => {
  const items: CaseToolAttachment[] = [
    { id: "a", toolName: "NIHSS", text: "NIHSS: 9 — AVC moderado.\nSugestão: …", attachedAt: 1 },
  ];

  it("lista o resultado, deixa remover e reanalisar", async () => {
    const onRemove = vi.fn();
    const onReanalyze = vi.fn();
    render(
      <CaseToolAttachments
        items={items}
        canRespond
        busy={false}
        onRemove={onRemove}
        onReanalyze={onReanalyze}
      />,
    );

    expect(screen.getByText("Entram na próxima reanálise do caso.")).toBeInTheDocument();
    expect(screen.getByText("NIHSS: 9 — AVC moderado.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remover NIHSS" }));
    expect(onRemove).toHaveBeenCalledWith("a");
    await userEvent.click(screen.getByRole("button", { name: "Reanalisar com os resultados" }));
    expect(onReanalyze).toHaveBeenCalled();
  });

  it("no limite de rodadas avisa que o resultado não entra mais", () => {
    render(
      <CaseToolAttachments
        items={items}
        canRespond={false}
        busy={false}
        onRemove={vi.fn()}
        onReanalyze={vi.fn()}
      />,
    );

    expect(screen.getByText(/Limite de rodadas atingido/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reanalisar com os resultados" }),
    ).not.toBeInTheDocument();
  });

  it("sem anexo, nada aparece", () => {
    const { container } = render(
      <CaseToolAttachments items={[]} canRespond busy={false} onRemove={vi.fn()} onReanalyze={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
