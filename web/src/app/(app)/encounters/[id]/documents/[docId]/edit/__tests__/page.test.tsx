import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/lib/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import DocumentEditPage from "../page";

const saveDocument = vi.fn();
let currentDocument: Document;

vi.mock("@/lib/clinical-queries", () => ({
  useEncounterDocument: () => ({ data: currentDocument, isPending: false, error: null, refetch: vi.fn() }),
  useEncounterDetail: () => ({ data: undefined, isPending: false }),
  useEncounterDocuments: () => ({ data: [currentDocument] }),
  useGenerateDocument: () => ({ mutateAsync: vi.fn() }),
  useUpdateDocument: () => ({ mutateAsync: saveDocument, isPending: false }),
  useConfirmDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-store", () => ({ useAuth: () => ({ physician: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dipirona = { medicamento: "Dipirona", dosagem: "1 g", via: "IV", frequencia: "6/6h", duracao: "3 dias" };
const ondansetrona = {
  medicamento: "Ondansetrona",
  dosagem: "4 mg",
  via: "IV",
  frequencia: "8/8h",
  duracao: "se náusea",
};

const prescricao: Document = {
  id: "doc-1",
  encounterId: "enc-1",
  physicianId: "phy-1",
  type: "prescricao",
  content: {
    paciente: "PAC-001",
    data: "10/10/2026",
    medicamentos: [dipirona, ondansetrona],
    orientacoes: "- Retornar se febre persistir",
    incerteza: true,
    avisoRevisao: "REVISÃO OBRIGATÓRIA: dose a confirmar",
  },
  physicianEdits: null,
  confirmedBy: null,
  confirmedAt: null,
  contentHash: null,
  createdAt: "2026-10-10T12:00:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
};

/** Promise já resolvida que o `use()` do React lê sem suspender. */
function resolvedParams() {
  const params = { id: "enc-1", docId: "doc-1" };
  return Object.assign(Promise.resolve(params), { status: "fulfilled", value: params });
}

async function renderEditor(document: Document) {
  currentDocument = document;
  render(
    <TooltipProvider>
      <Suspense fallback={null}>
        <DocumentEditPage params={resolvedParams()} />
      </Suspense>
    </TooltipProvider>,
  );
  await screen.findByRole("region", { name: "Medicamentos" });
}

describe("Editor de documento — lista de medicamentos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveDocument.mockResolvedValue(prescricao);
  });

  it("mostra um medicamento por linha com dose, via, frequência e duração", async () => {
    await renderEditor(prescricao);

    expect(screen.getByRole("textbox", { name: "Medicamentos" })).toHaveValue(
      "Dipirona — 1 g, IV, 6/6h, 3 dias\nOndansetrona — 4 mg, IV, 8/8h, se náusea",
    );
  });

  it("salvar depois de editar as orientações grava a lista de medicamentos inteira", async () => {
    const user = userEvent.setup();
    await renderEditor(prescricao);

    await user.clear(screen.getByRole("textbox", { name: "Orientações" }));
    await user.type(screen.getByRole("textbox", { name: "Orientações" }), "- Hidratação oral");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
    const { physicianEdits } = saveDocument.mock.calls[0]![0] as { physicianEdits: Record<string, unknown> };
    expect(physicianEdits).toEqual({ ...prescricao.content, orientacoes: "- Hidratação oral" });
  });

  it("documento assinado mostra a lista que foi selada, não a original da IA", async () => {
    await renderEditor({
      ...prescricao,
      physicianEdits: { ...prescricao.content, medicamentos: [dipirona] },
      confirmedBy: "phy-1",
      confirmedAt: "2026-10-10T13:00:00.000Z",
      contentHash: "a".repeat(64),
    });

    const list = screen.getByRole("region", { name: "Medicamentos" });
    expect(list).toHaveTextContent("Dipirona — 1 g, IV, 6/6h, 3 dias");
    expect(within(list).queryByText(/Ondansetrona/)).not.toBeInTheDocument();
  });
});
