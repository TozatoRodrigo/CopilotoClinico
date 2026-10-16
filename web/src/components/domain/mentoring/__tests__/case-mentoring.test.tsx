import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  EnabledMentoringConfig,
} from "@/lib/mentoring-queries";
import type { MentoringRequestView } from "@/lib/types";
import { CaseMentoring } from "../case-mentoring";

const terms: EnabledMentoringConfig["terms"] = {
  version: "2026-10-14-provisorio",
  provisional: true,
  requester: {
    title: "Termo de teleinterconsulta — médico solicitante",
    paragraphs: ["Você continua sendo o médico responsável pelo paciente."],
  },
  mentor: { title: "Termo do mentor", paragraphs: ["Opinião em teleinterconsulta."] },
};

const state = {
  config: null as EnabledMentoringConfig | null,
  requests: [] as MentoringRequestView[],
};
const create = vi.fn();
const cancel = vi.fn();
const rate = vi.fn();
const markSeen = vi.fn();

vi.mock("@/lib/mentoring-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mentoring-queries")>()),
  useMentoringEnabled: () => state.config,
  useEncounterMentoring: () => ({ data: state.requests }),
  useCreateMentoringRequest: () => ({ mutateAsync: create, isPending: false }),
  useCancelMentoringRequest: () => ({ mutateAsync: cancel, isPending: false }),
  useRateMentoringRequest: () => ({ mutateAsync: rate, isPending: false }),
  useMarkMentoringAnswerSeen: () => ({ mutate: markSeen }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function request(overrides: Partial<MentoringRequestView> = {}): MentoringRequestView {
  return {
    id: "req-1",
    encounterId: "enc-1",
    status: "pending",
    question: null,
    termsVersion: terms.version,
    createdAt: "2026-10-14T10:05:00.000Z",
    claimedAt: null,
    mentorName: null,
    answer: null,
    answeredAt: null,
    answerSeenAt: null,
    cancelledAt: null,
    satisfaction: null,
    ...overrides,
  };
}

/**
 * CC-707 — o botão só existe com a flag ligada, o pedido só sai depois do
 * aviso de urgência e do aceite do termo, e a resposta do mentor aparece no
 * caso com a nota de 1 a 5.
 */
describe("CaseMentoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.config = { enabled: true, isMentor: false, terms };
    state.requests = [];
    create.mockResolvedValue(request());
    cancel.mockResolvedValue(request({ status: "cancelled" }));
    rate.mockResolvedValue(request({ status: "answered", satisfaction: 4 }));
  });

  it("não mostra nada com COPILOT_MENTORING desligada", () => {
    state.config = null;
    const { container } = render(<CaseMentoring encounterId="enc-1" hasAnalysis />);
    expect(container).toBeEmptyDOMElement();
  });

  it("só envia depois do aviso de urgência e do aceite do termo, com a versão aceita", async () => {
    const user = userEvent.setup();
    render(<CaseMentoring encounterId="enc-1" hasAnalysis />);

    await user.click(screen.getByRole("button", { name: /Discutir com um médico da equipe/i }));

    expect(screen.getByText("Não é para urgência")).toBeInTheDocument();
    expect(screen.getByText(/Você continua responsável pelo paciente/i)).toBeInTheDocument();
    expect(screen.getByText("Texto provisório")).toBeInTheDocument();
    expect(screen.getByText(terms.version)).toBeInTheDocument();

    const send = screen.getByRole("button", { name: /Enviar para a equipe/i });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText(/O que você quer discutir/i), "Vale anticoagular?");
    await user.click(screen.getByRole("checkbox"));
    expect(send).toBeEnabled();
    await user.click(send);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        termsVersion: terms.version,
        acknowledgedNotUrgent: true,
        question: "Vale anticoagular?",
      }),
    );
  });

  it("deixa o botão indisponível sem plano do copiloto", () => {
    render(<CaseMentoring encounterId="enc-1" hasAnalysis={false} />);
    expect(
      screen.getByRole("button", { name: /Discutir com um médico da equipe/i }),
    ).toBeDisabled();
    expect(screen.getByText(/Disponível depois do plano do copiloto/i)).toBeInTheDocument();
  });

  it("mostra o pedido em aberto e deixa cancelar, sem oferecer um segundo pedido", async () => {
    state.requests = [request({ status: "claimed", mentorName: "Dr. Ripardo" })];
    const user = userEvent.setup();
    render(<CaseMentoring encounterId="enc-1" hasAnalysis />);

    expect(screen.getByText(/Em análise por um médico da equipe/i)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Ripardo/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Discutir com um médico da equipe/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cancelar pedido/i }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ requestId: "req-1" }));
  });

  it("mostra a resposta no caso, marca como lida e pede a nota de 1 a 5", async () => {
    state.requests = [
      request({
        status: "answered",
        mentorName: "Dr. Ripardo",
        answer: "Eu pediria troponina seriada antes de anticoagular.",
        answeredAt: "2026-10-14T12:00:00.000Z",
      }),
    ];
    const user = userEvent.setup();
    render(<CaseMentoring encounterId="enc-1" hasAnalysis />);

    const answer = screen.getByRole("article", { name: /Resposta de Dr\. Ripardo/i });
    expect(answer).toHaveTextContent("Eu pediria troponina seriada antes de anticoagular.");
    expect(answer).toHaveTextContent("Nova");
    expect(answer).toHaveTextContent(/Você segue responsável pelo paciente/i);
    expect(markSeen).toHaveBeenCalledWith({ requestId: "req-1" });

    await user.click(screen.getByRole("button", { name: "Nota 4 de 5" }));
    await waitFor(() =>
      expect(rate).toHaveBeenCalledWith({ requestId: "req-1", body: { satisfaction: 4 } }),
    );
  });

  it("depois da nota, mostra a nota em vez de perguntar de novo", () => {
    state.requests = [
      request({
        status: "answered",
        answer: "Ok.",
        answeredAt: "2026-10-14T12:00:00.000Z",
        answerSeenAt: "2026-10-14T12:10:00.000Z",
        satisfaction: 5,
      }),
    ];
    render(<CaseMentoring encounterId="enc-1" hasAnalysis />);

    expect(screen.getByText(/Sua nota: 5 de 5/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nota \d de 5/ })).not.toBeInTheDocument();
    expect(markSeen).not.toHaveBeenCalled();
    expect(screen.queryByText("Nova")).not.toBeInTheDocument();
  });
});
