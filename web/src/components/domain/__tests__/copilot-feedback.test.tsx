import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopilotFeedback } from "../copilot-feedback";

const mutateAsync = vi.fn();

vi.mock("@/lib/clinical-queries", () => ({
  useCopilotFeedback: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * F7 — o botão existe para que um erro clínico chegue com o rastro técnico
 * anexado, em vez de virar mensagem de WhatsApp dias depois sem
 * interactionId nem chunks recuperados.
 */
describe("CopilotFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ recorded: true });
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
});
