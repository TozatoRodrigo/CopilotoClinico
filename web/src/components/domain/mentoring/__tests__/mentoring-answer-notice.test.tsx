import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EnabledMentoringConfig } from "@/lib/mentoring-queries";
import type { MentoringNotificationsResponse } from "@/lib/types";
import { MentoringAnswerNotice } from "../mentoring-answer-notice";

const state = {
  config: null as EnabledMentoringConfig | null,
  notifications: { unreadAnswers: [] } as MentoringNotificationsResponse,
};

vi.mock("@/lib/mentoring-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mentoring-queries")>()),
  useMentoringEnabled: () => state.config,
  useMentoringNotifications: () => ({ data: state.notifications }),
}));

const config: EnabledMentoringConfig = {
  enabled: true,
  isMentor: false,
  terms: {
    version: "v",
    provisional: true,
    requester: { title: "t", paragraphs: [] },
    mentor: { title: "t", paragraphs: [] },
  },
};

/** CC-707 — o médico é avisado no app quando um médico da equipe responde. */
describe("MentoringAnswerNotice", () => {
  beforeEach(() => {
    state.config = config;
    state.notifications = { unreadAnswers: [] };
  });

  it("não aparece com a mentoria desligada", () => {
    state.config = null;
    state.notifications = {
      unreadAnswers: [
        {
          requestId: "r1",
          encounterId: "e1",
          caseTitle: "Dor torácica",
          mentorName: null,
          answeredAt: "2026-10-14T12:00:00.000Z",
        },
      ],
    };
    const { container } = render(<MentoringAnswerNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não aparece sem resposta nova", () => {
    const { container } = render(<MentoringAnswerNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("leva ao caso respondido", () => {
    state.notifications = {
      unreadAnswers: [
        {
          requestId: "r1",
          encounterId: "e1",
          caseTitle: "Dor torácica",
          mentorName: "Dr. Ripardo",
          answeredAt: "2026-10-14T12:00:00.000Z",
        },
      ],
    };
    render(<MentoringAnswerNotice />);

    expect(screen.getByText("Um médico da equipe respondeu ao seu caso")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dor torácica" })).toHaveAttribute(
      "href",
      "/encounters/e1",
    );
    expect(screen.getByText(/Dr\. Ripardo/)).toBeInTheDocument();
  });
});
