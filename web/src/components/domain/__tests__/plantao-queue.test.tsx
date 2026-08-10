import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlantaoQueue } from "../plantao-queue";
import type { EncounterSummary } from "@/lib/types";

const NOW = new Date("2025-06-01T12:00:00Z");

function makeEncounter(overrides: Partial<EncounterSummary> = {}): EncounterSummary {
  return {
    id: "enc-1",
    vertical: "trauma",
    patientRef: "PRN-001",
    chiefComplaint: null,
    status: "in_review",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    highestRedFlagSeverity: null,
    lastInteractionAt: NOW.toISOString(),
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("PlantaoQueue (PI-01)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows no reassessment badge for a fresh case with no red flags", () => {
    render(
      <PlantaoQueue
        encounters={[makeEncounter({ lastInteractionAt: minutesAgo(1) })]}
      />,
    );
    expect(screen.queryByText("Reavaliar")).not.toBeInTheDocument();
  });

  it("shows the amber Reavaliar badge once a high-severity case crosses its 30min window", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({
            highestRedFlagSeverity: "high",
            lastInteractionAt: minutesAgo(31),
          }),
        ]}
      />,
    );
    expect(screen.getByText("Reavaliar")).toBeInTheDocument();
  });

  it("does not flag a high-severity case still within its 30min window", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({
            highestRedFlagSeverity: "high",
            lastInteractionAt: minutesAgo(29),
          }),
        ]}
      />,
    );
    expect(screen.queryByText("Reavaliar")).not.toBeInTheDocument();
  });

  it("uses the shortest window (15min) for critical severity", () => {
    const { rerender } = render(
      <PlantaoQueue
        encounters={[
          makeEncounter({ highestRedFlagSeverity: "critical", lastInteractionAt: minutesAgo(14) }),
        ]}
      />,
    );
    expect(screen.queryByText("Reavaliar")).not.toBeInTheDocument();

    rerender(
      <PlantaoQueue
        encounters={[
          makeEncounter({ highestRedFlagSeverity: "critical", lastInteractionAt: minutesAgo(16) }),
        ]}
      />,
    );
    expect(screen.getByText("Reavaliar")).toBeInTheDocument();
  });

  it("uses the 120min window when there is no red flag severity at all", () => {
    const { rerender } = render(
      <PlantaoQueue encounters={[makeEncounter({ lastInteractionAt: minutesAgo(119) })]} />,
    );
    expect(screen.queryByText("Reavaliar")).not.toBeInTheDocument();

    rerender(<PlantaoQueue encounters={[makeEncounter({ lastInteractionAt: minutesAgo(121) })]} />);
    expect(screen.getByText("Reavaliar")).toBeInTheDocument();
  });

  it("falls back to createdAt when lastInteractionAt is null (case never analyzed)", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({
            lastInteractionAt: null,
            createdAt: minutesAgo(121),
            updatedAt: minutesAgo(121),
          }),
        ]}
      />,
    );
    expect(screen.getByText("Reavaliar")).toBeInTheDocument();
  });

  it("never flags finalized or cancelled encounters, regardless of elapsed time or severity", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({
            status: "finalized",
            highestRedFlagSeverity: "critical",
            lastInteractionAt: minutesAgo(500),
          }),
          makeEncounter({
            id: "enc-2",
            status: "cancelled",
            highestRedFlagSeverity: "critical",
            lastInteractionAt: minutesAgo(500),
          }),
        ]}
      />,
    );
    expect(screen.queryByText("Reavaliar")).not.toBeInTheDocument();
  });

  it("shows the header counter with the exact number of overdue cases, and the clinical-judgment disclaimer", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({ id: "enc-1", highestRedFlagSeverity: "critical", lastInteractionAt: minutesAgo(20) }),
          makeEncounter({ id: "enc-2", highestRedFlagSeverity: "high", lastInteractionAt: minutesAgo(40) }),
          makeEncounter({ id: "enc-3", lastInteractionAt: minutesAgo(1) }),
        ]}
      />,
    );
    expect(screen.getByText("2 aguardando reavaliação")).toBeInTheDocument();
    expect(screen.getByText(/não substitui julgamento clínico/)).toBeInTheDocument();
  });

  it("hides the counter and disclaimer entirely when nothing is overdue", () => {
    render(<PlantaoQueue encounters={[makeEncounter({ lastInteractionAt: minutesAgo(1) })]} />);
    expect(screen.queryByText(/aguardando reavaliação/)).not.toBeInTheDocument();
    expect(screen.queryByText(/não substitui julgamento clínico/)).not.toBeInTheDocument();
  });

  it("sorts an overdue case ahead of a non-overdue case within the same status", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({ id: "fresh", patientRef: "PRN-FRESH", status: "in_review", lastInteractionAt: minutesAgo(1) }),
          makeEncounter({
            id: "overdue",
            patientRef: "PRN-OVERDUE",
            status: "in_review",
            highestRedFlagSeverity: "critical",
            lastInteractionAt: minutesAgo(20),
          }),
        ]}
      />,
    );

    const overdueEl = screen.getByText("PRN-OVERDUE");
    const freshEl = screen.getByText("PRN-FRESH");
    expect(
      overdueEl.compareDocumentPosition(freshEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("still prioritizes in_review status over draft, even when the draft case is overdue", () => {
    render(
      <PlantaoQueue
        encounters={[
          makeEncounter({
            id: "overdue-draft",
            patientRef: "PRN-DRAFT",
            status: "draft",
            highestRedFlagSeverity: "critical",
            lastInteractionAt: minutesAgo(500),
            createdAt: minutesAgo(500),
          }),
          makeEncounter({
            id: "fresh-review",
            patientRef: "PRN-REVIEW",
            status: "in_review",
            lastInteractionAt: minutesAgo(1),
          }),
        ]}
      />,
    );

    const reviewEl = screen.getByText("PRN-REVIEW");
    const draftEl = screen.getByText("PRN-DRAFT");
    expect(
      reviewEl.compareDocumentPosition(draftEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
