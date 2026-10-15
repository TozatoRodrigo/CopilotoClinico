import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopilotFeedback } from "../copilot-feedback";

const mutateAsync = vi.fn();
const reportGap = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/clinical-queries", () => ({
  useCopilotFeedback: () => ({ mutateAsync, isPending: false }),
  useReportKnowledgeGap: () => ({ mutateAsync: reportGap, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));

/**
 * F7 — o botão existe para que um erro clínico chegue com o rastro técnico
 * anexado, em vez de virar mensagem de WhatsApp dias depois sem
 * interactionId nem chunks recuperados.
 */
describe("CopilotFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ recorded: true });
    reportGap.mockResolvedValue({ recorded: true });
  });

  it("envia 'foi útil' direto, sem pedir comentário", async () => {
    const user = userEvent.setup();
    render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

    await user.click(screen.getByRole("button", { name: /Foi útil/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        interactionId: "int-1",
        kind: "helpful",
        comment: undefined,
      }),
    );
  });

  it("pede o contexto antes de enviar 'cenário errado' — é o campo mais útil na triagem", async () => {
    const user = userEvent.setup();
    render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

    await user.click(screen.getByRole("button", { name: /Cenário errado/i }));
    expect(mutateAsync).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox"), "Era dengue, foi para sepse.");
    await user.click(screen.getByRole("button", { name: /Enviar reporte/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        interactionId: "int-1",
        kind: "wrong_scenario",
        comment: "Era dengue, foi para sepse.",
      }),
    );
  });

  it("confirma o registro e não deixa o médico reenviar o mesmo reporte", async () => {
    const user = userEvent.setup();
    render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

    await user.click(screen.getByRole("button", { name: /Foi útil/i }));

    expect(await screen.findByText(/Reporte registrado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Foi útil/i })).not.toBeInTheDocument();
  });

  /**
   * CC-703 — "não encontrei o que precisava" não diz que a análise errou,
   * diz o que faltou: vai para o registro de lacunas, não para a triagem.
   */
  describe("não encontrei o que precisava", () => {
    it("registra a lacuna com a frase curta do que faltou", async () => {
      const user = userEvent.setup();
      render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

      await user.click(screen.getByRole("button", { name: /Não encontrei o que precisava/i }));
      await user.type(
        screen.getByRole("textbox", { name: "O que faltou (opcional)" }),
        "Dose de ceftriaxona na meningite",
      );
      await user.click(screen.getByRole("button", { name: "Registrar" }));

      await waitFor(() =>
        expect(reportGap).toHaveBeenCalledWith({
          interactionId: "int-1",
          note: "Dose de ceftriaxona na meningite",
        }),
      );
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(await screen.findByText(/O que faltou entra na lista/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Não encontrei o que precisava/i }),
      ).not.toBeInTheDocument();
    });

    it("aceita registrar sem dizer o que faltou", async () => {
      const user = userEvent.setup();
      render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

      await user.click(screen.getByRole("button", { name: /Não encontrei o que precisava/i }));
      await user.click(screen.getByRole("button", { name: "Registrar" }));

      await waitFor(() =>
        expect(reportGap).toHaveBeenCalledWith({ interactionId: "int-1", note: undefined }),
      );
    });

    it("limita a frase ao teto do contrato", async () => {
      const user = userEvent.setup();
      render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

      await user.click(screen.getByRole("button", { name: /Não encontrei o que precisava/i }));

      expect(screen.getByRole("textbox", { name: "O que faltou (opcional)" })).toHaveAttribute(
        "maxlength",
        "280",
      );
    });

    it("continua disponível depois de um reporte", async () => {
      const user = userEvent.setup();
      render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

      await user.click(screen.getByRole("button", { name: /Foi útil/i }));
      await screen.findByText(/Reporte registrado/i);

      expect(
        screen.getByRole("button", { name: /Não encontrei o que precisava/i }),
      ).toBeInTheDocument();
    });

    it("mantém o campo aberto e avisa quando não consegue registrar", async () => {
      reportGap.mockRejectedValue(new Error("rede"));
      const user = userEvent.setup();
      render(<CopilotFeedback encounterId="enc-1" interactionId="int-1" />);

      await user.click(screen.getByRole("button", { name: /Não encontrei o que precisava/i }));
      await user.click(screen.getByRole("button", { name: "Registrar" }));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(screen.getByRole("textbox", { name: "O que faltou (opcional)" })).toBeInTheDocument();
    });
  });
});
